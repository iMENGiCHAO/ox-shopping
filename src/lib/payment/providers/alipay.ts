import "server-only";
import type { NextRequest } from "next/server";
import { badRequest } from "@/lib/errors";
import { buildAlipaySignContent, signWithRsa, verifyWithRsa } from "@/lib/payment/signature";
import {
  str,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
} from "@/lib/payment/provider";

/** 支付宝渠道配置字段元数据（后台表单动态渲染用） */
export const ALIPAY_FIELDS = [
  { key: "appId", label: "App ID", secret: false },
  { key: "privateKey", label: "应用私钥", secret: true },
  { key: "alipayPublicKey", label: "支付宝公钥", secret: false },
  { key: "gatewayUrl", label: "网关地址", secret: false },
  { key: "notifyUrl", label: "异步通知地址", secret: false },
  { key: "sandbox", label: "沙箱模式", secret: false },
] as const;

/**
 * AlipayProvider —— 支付宝（PC 网页支付 alipay.trade.page.pay）。
 *
 * 本阶段（无商户账号）实现到「参数组装 + RSA2 签名 / 验签」级别，逻辑可单元测试；
 * 真实 HTTPS 下单/退款留待申请账号并在后台启用后再接（不做真实扣款）。
 */
export const alipayProvider: PaymentProvider = {
  key: "alipay",

  isConfigured(config) {
    return (
      str(config, "appId").length > 0 &&
      str(config, "privateKey").length > 0 &&
      str(config, "alipayPublicKey").length > 0
    );
  },

  isReady() {
    // 预留级：参数组装 + RSA2 签名/验签已就绪，未接真实网关 HTTPS 下单
    return false;
  },

  readinessNote:
    "参数组装与 RSA2 签名/验签已完成，但尚未接入支付宝网关的实时下单/退款请求，因此不会对顾客展示。需开通商户账号后完成网关对接再启用。",

  /** 国内网关仅支持人民币结算 */
  supportedCurrencies: ["CNY"],

  async createPayment(input: CreatePaymentInput, config): Promise<CreatePaymentResult> {
    const bizContent = JSON.stringify({
      out_trade_no: input.orderNumber,
      total_amount: input.total.toFixed(2),
      subject: input.subject,
      product_code: "FAST_INSTANT_TRADE_PAY",
    });
    const params: Record<string, string> = {
      app_id: str(config, "appId"),
      method: "alipay.trade.page.pay",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      version: "1.0",
      notify_url: str(config, "notifyUrl"),
      biz_content: bizContent,
    };
    const signContent = buildAlipaySignContent(params);
    const sign = signWithRsa(str(config, "privateKey"), signContent);
    void sign;

    // TODO(申请账号后启用)：将 params + sign（URL 编码）拼到 gatewayUrl 上跳转。
    // 本阶段不真实发起支付请求，返回明确提示，避免误扣款。
    throw badRequest(
      "Alipay is configured but the live payment request is not wired up yet. It will be available once the merchant account is onboarded.",
    );
  },

  async verifyNotify(req: NextRequest, config) {
    // 支付宝异步通知为 application/x-www-form-urlencoded POST
    let params: Record<string, string>;
    try {
      const body = await req.formData();
      params = {};
      for (const [k, v] of body.entries()) params[k] = String(v);
    } catch {
      return null;
    }
    if ((params["sign_type"] ?? "RSA2") !== "RSA2") return null;
    const content = buildAlipaySignContent(params);
    if (!verifyWithRsa(str(config, "alipayPublicKey"), content, params["sign"] ?? "")) {
      return null;
    }
    const orderNumber = params["out_trade_no"] ?? "";
    const transactionId = params["trade_no"] ?? "";
    const amount = Number(params["total_amount"] ?? "0");
    if (!orderNumber) return null;
    // 商用审计修复：验签通过 ≠ 交易成功。TRADE_CLOSED（超时关单）/
    // WAIT_BUYER_PAY 等「非成功」通知同样带合法签名且金额一致 ——
    // 不校验状态就会把未付款订单标 PAID 发货。
    if (
      params["trade_status"] !== "TRADE_SUCCESS" &&
      params["trade_status"] !== "TRADE_FINISHED"
    ) {
      return null;
    }
    return { orderNumber, transactionId, amount };
  },

  async refund() {
    throw badRequest("Alipay refunds are not connected to the live gateway yet.");
  },
};
