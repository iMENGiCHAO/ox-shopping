import "server-only";
import Stripe from "stripe";
import { env, effectivePaymentMode } from "@/lib/env";
import { toCents } from "@/lib/utils";
import { formatMoney } from "@/lib/utils";

/**
 * Stripe 支付。
 * 未配置密钥时 effectivePaymentMode === "mock"，走内置模拟支付(见 payment/mock.ts)。
 *
 * 密钥来源（渠道化后）：
 *  - 后台「支付渠道 → Stripe」填入密钥（加密存 payment_channels） → keys 覆盖参数生效；
 *  - 未在后台配置 Stripe 渠道 → 回落环境变量 STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET（原有行为）。
 */

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      typescript: true,
    });
  }
  return stripeClient;
}

/** 密钥覆盖（后台渠道配置注入）；字段留空 = 跟随环境变量 */
export interface StripeKeysOverride {
  secretKey?: string;
  webhookSecret?: string;
}

function clientFor(keys?: StripeKeysOverride): Stripe | null {
  if (keys?.secretKey) {
    if (keys.secretKey === env.STRIPE_SECRET_KEY) return getStripe();
    return new Stripe(keys.secretKey, {
      apiVersion: "2024-06-20",
      typescript: true,
    });
  }
  return getStripe();
}

export interface CheckoutItem {
  name: string;
  image?: string | null;
  quantity: number;
  /** 单位：元 */
  price: number;
}

export interface CheckoutOrderInfo {
  orderNumber: string;
  currency: string;
  /** 单位：元 */
  total: number;
  customerEmail: string;
  /**
   * 游客订单查询令牌（登录单为 null）。
   * 回跳地址必须带上它，否则游客付完款落在结果页后，
   * 「查看订单」会因为没有令牌而 404。
   */
  accessToken?: string | null;
}

/** 创建 Stripe Checkout Session，返回跳转 URL 与会话 ID（用于掉单对账） */
export async function createCheckoutSession(
  order: CheckoutOrderInfo,
  items: CheckoutItem[],
  keys?: StripeKeysOverride,
): Promise<{ url: string; sessionId: string }> {
  const stripe = clientFor(keys);
  if (!stripe) throw new Error("Stripe 未配置");

  // 游客单回跳时带上查询令牌（登录单为空串，URL 完全不变）
  const tokenSuffix = order.accessToken ? `&token=${encodeURIComponent(order.accessToken)}` : "";

  // Stripe 不支持 CNY；启用 Stripe 时请在 .env 使用其支持的币种(如 USD)
  if (order.currency === "CNY") {
    throw new Error(
      "Stripe 不支持 CNY 币种：请将 .env 中 CURRENCY 改为 Stripe 支持的币种(如 USD)，或使用 PAYMENT_MODE=mock",
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.customerEmail,
    line_items: items.map((item) => ({
      price_data: {
        currency: order.currency.toLowerCase(),
        unit_amount: toCents(item.price),
        product_data: {
          name: item.name,
          ...(item.image ? { images: [item.image] } : {}),
        },
      },
      quantity: item.quantity,
    })),
    metadata: {
      orderNumber: order.orderNumber,
    },
    payment_intent_data: {
      metadata: { orderNumber: order.orderNumber },
    },
    success_url: `${env.SITE_URL}/checkout/result?orderNumber=${order.orderNumber}&status=success${tokenSuffix}`,
    cancel_url: `${env.SITE_URL}/checkout/result?orderNumber=${order.orderNumber}&status=cancelled${tokenSuffix}`,
  });

  if (!session.url) throw new Error("Stripe 未返回 Checkout URL");
  return { url: session.url, sessionId: session.id };
}

/**
 * 掉单对账预留接口：按会话 ID 查询支付状态。
 * 定时任务用它核对 PENDING_PAYMENT 订单在网关侧的真实状态（已支付→补标记，过期→取消）。
 *
 * `opts` 用于给**定时对账**路径加时间上界。为什么必须能加上界：
 * 对账在 `prisma.$transaction` 里调用（事务存在的唯一目的是持有
 * `pg_try_advisory_xact_lock` 做多实例选主），Stripe SDK 的默认超时是 80s，
 * 一旦网关变慢，事务时长就被外部服务延迟支配 —— 超过事务超时后**锁会提前释放**，
 * 另一个实例会并发跑同一轮任务。给出上界后事务时长有确定范围。
 * 建单路径（用户在等跳转）不传 `opts`，保持 SDK 默认行为。
 */
export interface RetrieveSessionOptions {
  /** 单次请求超时（毫秒） */
  timeoutMs?: number;
  /** 网络重试次数；对账路径建议 0（失败下轮重来，不要拖长持锁事务） */
  maxNetworkRetries?: number;
}

export async function retrieveCheckoutSession(
  sessionId: string,
  keys?: StripeKeysOverride,
  opts: RetrieveSessionOptions = {},
): Promise<Stripe.Checkout.Session | null> {
  const stripe = clientFor(keys);
  if (!stripe) return null;
  const requestOptions: Stripe.RequestOptions = {};
  if (opts.timeoutMs !== undefined) requestOptions.timeout = opts.timeoutMs;
  if (opts.maxNetworkRetries !== undefined) {
    requestOptions.maxNetworkRetries = opts.maxNetworkRetries;
  }
  try {
    return await stripe.checkout.sessions.retrieve(sessionId, {}, requestOptions);
  } catch {
    return null; // 会话不存在/网络异常/超时：对账任务跳过，不阻塞主流程
  }
}

/** 校验 Webhook 签名并构造事件(签名错误抛错 → 上层返回 400) */
export function constructWebhookEvent(
  payload: string,
  signature: string,
  keys?: StripeKeysOverride,
): Stripe.Event {
  const stripe = clientFor(keys);
  const secret = keys?.webhookSecret || env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    throw new Error("Stripe webhook 未配置");
  }
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

/** Stripe 退款(支付成功后订单退款) */
export async function createStripeRefund(
  paymentIntentId: string,
  amountYuan: number,
  keys?: StripeKeysOverride,
): Promise<Stripe.Refund> {
  const stripe = clientFor(keys);
  if (!stripe) throw new Error("Stripe 未配置");
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: toCents(amountYuan),
  });
}

export { effectivePaymentMode, formatMoney };
