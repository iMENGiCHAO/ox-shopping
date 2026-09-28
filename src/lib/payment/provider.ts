import "server-only";
import type { NextRequest } from "next/server";

/**
 * 支付抽象层 —— PaymentProvider 接口定义。
 *
 * 每个支付渠道（payment_channels 一行）通过 `provider` 字段指向一个实现；
 * 结算 / 回调 / 退款统一经此分发。具体实现与注册表见 providers/index.ts。
 */

/** 渠道运行时对象（config 已由 channel.service 解密） */
export interface PaymentChannelRuntime {
  id: string;
  code: string;
  name: string;
  provider: string;
  enabled: boolean;
  sortOrder: number;
  config: Record<string, unknown>;
}

export interface CreatePaymentInput {
  orderNumber: string;
  /** 单位：元 */
  total: number;
  currency: string;
  subject: string;
  customerEmail?: string;
  /** 游客订单查询令牌；支付回跳必须透传，避免付款后丢失订单访问权。 */
  accessToken?: string | null;
  /**
   * 品牌名（收银台展示用，如 PayPal application_context.brand_name）。
   * 由 order.service 从站点设置注入；缺省时渠道侧回落到 `brandFallback`。
   */
  brandName?: string;
}

/** 支付结果：redirect = 需跳转第三方 / 站内收银台；mock = 站内模拟支付页 */
export type CreatePaymentResult =
  | { kind: "redirect"; url: string; transactionId?: string }
  | { kind: "mock"; url: string; transactionId?: string };

export interface VerifyNotifyResult {
  orderNumber: string;
  /** 支付交易号；Stripe 必须传 PaymentIntent id，不能传 Checkout Session id。 */
  transactionId: string;
  /** 单位：元 */
  amount: number;
  /** 币种（ISO 4217）；回调提供时必须与订单币种精确匹配。 */
  currency?: string;
  /** Stripe Checkout Session id（只用于会话维度对账，不写入 paymentId）。 */
  sessionId?: string;
  /**
   * 报文验签合法、但**当前不应认账**（如 Stripe 异步支付方式 SEPA/Boleto/OXXO/
   * Klarna 在客户提交收银台瞬间就发 completed，payment_status 仍是 unpaid）。
   * 调用方语义：回 success 让网关停止重试，但**不置 PAID**；等待后续到账事件
   * （async_payment_succeeded）驱动。资金审计 D3 修复。
   */
  skipReason?: string;
}

export interface RefundInput {
  orderNumber: string;
  /** 单位：元 */
  amount: number;
  gatewayId?: string | null;
  currency: string;
  reason?: string;
  /** 渠道幂等键；同一退款重试必须复用，禁止产生第二笔网关退款。 */
  idempotencyKey?: string;
}

export interface PaymentProvider {
  /** 与 payment_channels.provider 对应 */
  key: string;
  /** 配置是否满足「可对外收款」的最低要求（后台启用门槛） */
  isConfigured(config: Record<string, unknown>): boolean;
  /**
   * 渠道是否「真实可收款」（前台 available 判据）。
   * - 预留级渠道（参数组装/验签已就绪、未接真实网关 HTTPS 请求）返回 false；
   * - 真实接入级渠道（mock / 渠道化 stripe）密钥齐全返回 true。
   * 缺省 = isConfigured 的结果（未显式声明视为配置即可用）。
   */
  isReady?(config: Record<string, unknown>): boolean;
  /**
   * 「已配置但不可用」时给**运营**看的解释（后台渠道列表展示）。
   *
   * 为什么需要它：预留级渠道的 isReady 恒为 false，于是运营把密钥全填对之后，
   * 后台只会显示一个「不可用」，却不说为什么——运营只能猜（密钥填错了？服务挂了？
   * 还是这个渠道根本没做？），最后往往反复重填或误判为系统故障。
   *
   * 约定：这里写的是**渠道接入进度**的说明，不是给顾客看的文案（顾客侧只显示
   * 「暂未开通」，见 listChannelsForFrontend）。仅在 configured && !ready 时展示。
   */
  readinessNote?: string;
  /**
   * 渠道支持的结算币种（ISO 4217，如 ["CNY"]）。
   * - 缺省 = 不限币种（mock / stripe 等多币种渠道）；
   * - 国内网关（alipay/wechat/bankcard）仅支持 CNY——订单币种与渠道不匹配时
   *   前台置灰提示「请切换币种」，服务端下单兜底拒绝（金额错乱防线）。
   */
  supportedCurrencies?: string[];
  /** 创建支付（下单后由 order.service 调用） */
  createPayment(
    input: CreatePaymentInput,
    config: Record<string, unknown>,
  ): Promise<CreatePaymentResult>;
  /** 校验异步回调；验签失败/无法确认时返回 null（或抛错），上层据此拒绝 */
  verifyNotify(
    req: NextRequest,
    config: Record<string, unknown>,
  ): Promise<VerifyNotifyResult | null>;
  /** 退款（订单退款走原支付渠道） */
  refund(
    input: RefundInput,
    config: Record<string, unknown>,
  ): Promise<{ gatewayRefundId: string; status?: "succeeded" | "pending" | "failed" }>;
}

/** 非空字符串取值助手 */
export function str(config: Record<string, unknown>, key: string): string {
  const v = config[key];
  return typeof v === "string" ? v : "";
}

/** 布尔取值助手（兼容字符串 "true"） */
export function bool(config: Record<string, unknown>, key: string): boolean {
  const v = config[key];
  return v === true || v === "true";
}
