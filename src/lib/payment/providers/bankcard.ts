import "server-only";
import type { NextRequest } from "next/server";
import { badRequest } from "@/lib/errors";
import { signWithHmac, verifyWithHmac } from "@/lib/payment/signature";
import {
  str,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
} from "@/lib/payment/provider";

/** 银行卡（通用网关）渠道配置字段元数据（后台表单动态渲染用） */
export const BANKCARD_FIELDS = [
  { key: "gatewayUrl", label: "网关地址 Gateway URL", secret: false },
  { key: "merchantId", label: "商户号 Merchant ID", secret: false },
  { key: "terminalId", label: "终端号 Terminal ID", secret: false },
  { key: "secretKey", label: "签名密钥 Secret Key", secret: true },
  { key: "notifyUrl", label: "异步通知地址 Notify URL", secret: false },
  { key: "sandbox", label: "沙箱模式 Sandbox", secret: false },
] as const;

/** 渠道签名原文：参数名 ASCII 字典序拼接（k=v&…，不含 sign 本身） */
function buildSignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== "sign")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

/**
 * BankcardProvider —— 银行卡支付（通用重定向网关，适配银联/Stripe/Adyen 等收银台模式）。
 *
 * 大爷需求：支付账户尚未申请，先预留渠道——后台「支付渠道」里已出现「银行卡支付」，
 * 填入网关地址/商户号/密钥并启用即可对接（结算参数组装 + HMAC-SHA256 验签已就绪）。
 *
 * 本阶段（无商户账号）实现到「参数组装 + HMAC 签名 / 验签」级别，逻辑可单元测试；
 * 真实 HTTPS 下单/退款留待申请账号并在后台启用后再接（不做真实扣款）。
 */
export const bankcardProvider: PaymentProvider = {
  key: "bankcard",

  isConfigured(config) {
    return (
      str(config, "gatewayUrl").length > 0 &&
      str(config, "merchantId").length > 0 &&
      str(config, "secretKey").length > 0
    );
  },

  isReady() {
    // 预留级：参数组装 + HMAC-SHA256 签名/验签已就绪，未接真实网关 HTTPS 下单
    return false;
  },

  readinessNote:
    "参数组装与 HMAC-SHA256 签名/验签已完成，但尚未接入银行卡网关的实时下单/退款请求，因此不会对顾客展示。需开通商户账号后完成网关对接再启用。",

  /** 国内网关仅支持人民币结算 */
  supportedCurrencies: ["CNY"],

  async createPayment(input: CreatePaymentInput, config): Promise<CreatePaymentResult> {
    const params: Record<string, string> = {
      merchant_id: str(config, "merchantId"),
      terminal_id: str(config, "terminalId"),
      out_trade_no: input.orderNumber,
      total_amount: input.total.toFixed(2),
      currency: input.currency,
      subject: input.subject,
      notify_url: str(config, "notifyUrl"),
      sandbox: str(config, "sandbox") || "false",
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
    };
    const signContent = buildSignContent(params);
    const sign = signWithHmac(str(config, "secretKey"), signContent);

    // TODO(申请账号后启用)：将 params + sign（URL 编码）POST/重定向到 gatewayUrl。
    // 各网关报文字段略有差异（银联/Stripe/Adyen），接入时按所选网关映射字段名即可，
    // 验签与订单落库逻辑（verifyNotify / /api/pay/notify/bankcard）无需改动。
    // 本阶段不真实发起支付请求，返回明确提示，避免误扣款。
    void sign;
    throw badRequest(
      "Bank card payment is configured but the live payment request is not wired up yet. It will be available once the merchant account is onboarded.",
    );
  },

  async verifyNotify(req: NextRequest, config) {
    // 通用网关异步通知：兼容 application/x-www-form-urlencoded 与 JSON
    let params: Record<string, string>;
    try {
      const contentType = req.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const body = (await req.json()) as Record<string, unknown>;
        params = {};
        for (const [k, v] of Object.entries(body)) params[k] = String(v ?? "");
      } else {
        const body = await req.formData();
        params = {};
        for (const [k, v] of body.entries()) params[k] = String(v);
      }
    } catch {
      return null;
    }
    const content = buildSignContent(params);
    if (!verifyWithHmac(str(config, "secretKey"), content, params["sign"] ?? "")) {
      return null;
    }
    const orderNumber = params["out_trade_no"] ?? "";
    const transactionId = params["transaction_id"] ?? "";
    const amount = Number(params["total_amount"] ?? "0");
    if (!orderNumber || !transactionId) return null;
    // 商用审计修复：只认「支付成功」状态（同 alipay 的 trade_status 纵深）
    if (params["status"] !== "SUCCESS" && params["trade_status"] !== "SUCCESS") {
      return null;
    }
    return { orderNumber, transactionId, amount };
  },

  async refund() {
    throw badRequest("Bank card refunds are not connected to the live gateway yet.");
  },
};
