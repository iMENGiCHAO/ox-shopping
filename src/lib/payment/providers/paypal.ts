import "server-only";
import type { NextRequest } from "next/server";
import { badRequest } from "@/lib/errors";
import { brandFallback } from "@/lib/env";
import {
  str,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
} from "@/lib/payment/provider";

/** PayPal 渠道配置字段元数据（后台表单动态渲染用） */
export const PAYPAL_FIELDS = [
  { key: "clientId", label: "Client ID", secret: false },
  { key: "clientSecret", label: "Client Secret", secret: true },
  { key: "notifyUrl", label: "Webhook 通知地址", secret: false },
  { key: "sandbox", label: "沙箱模式 Sandbox", secret: false },
] as const;

/**
 * PayPalProvider —— 国际电子钱包（PayPal Orders API）。
 *
 * 大爷需求：支付账户尚未申请，先预留渠道——后台「支付渠道」中已出现「PayPal」，
 * 填入 Client ID / Secret 并启用即可对接（订单参数组装已就绪，与 alipay/wechat 同级）。
 *
 * 本阶段（无商户账号）实现到「订单参数组装」级别；真实下单/退款走 PayPal Orders v2
 * （create order → approve link → capture）留待申请账号后接入，避免误扣款。
 */
export const paypalProvider: PaymentProvider = {
  key: "paypal",

  isConfigured(config) {
    return str(config, "clientId").length > 0 && str(config, "clientSecret").length > 0;
  },

  isReady() {
    // 预留级：参数组装就绪，尚未接入真实 Orders API 请求
    return false;
  },

  readinessNote:
    "订单参数组装已就绪，但尚未接入 PayPal Orders v2 的 create → approve → capture 实时请求，因此不会对顾客展示。需开通商户账号后完成对接再启用。",

  async createPayment(input: CreatePaymentInput, config): Promise<CreatePaymentResult> {
    // PayPal Orders v2 请求体（申请账号后直接 POST /v2/checkout/orders）
    const order = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.orderNumber,
          custom_id: input.orderNumber,
          description: input.subject.slice(0, 127),
          amount: {
            currency_code: input.currency,
            value: input.total.toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: str(config, "notifyUrl"),
        cancel_url: str(config, "notifyUrl"),
        brand_name: input.brandName?.trim() || brandFallback,
        user_action: "PAY_NOW",
      },
    };
    void order;

    // TODO(申请账号后启用)：OAuth2 client_credentials 取 token → POST Orders v2 → 返回 approve 跳转链接。
    // 本阶段不真实发起支付请求，返回明确提示，避免误扣款。
    throw badRequest(
      "PayPal is configured but the live payment request is not wired up yet. It will be available once the merchant account is onboarded.",
    );
  },

  async verifyNotify(req: NextRequest) {
    // PayPal 异步通知为 JSON + 传输签名校验（transmission_id/signature 验证链）；
    // 预留阶段不做验签，直接返回 null（上层返回 fail，PayPal 会重试）。
    void req;
    return null;
  },

  async refund() {
    throw badRequest("PayPal refunds are not connected to the live gateway yet.");
  },
};
