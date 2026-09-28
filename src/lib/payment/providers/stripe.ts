import "server-only";
import type { NextRequest } from "next/server";
import { badRequest } from "@/lib/errors";
import {
  createCheckoutSession,
  createStripeRefund,
  constructWebhookEvent,
  type StripeKeysOverride,
} from "@/lib/payment/stripe";
import {
  str,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
} from "@/lib/payment/provider";

/** Stripe 渠道配置字段元数据（后台表单动态渲染用） */
export const STRIPE_FIELDS = [
  { key: "secretKey", label: "Secret Key（sk_live_… / sk_test_…）", secret: true },
  { key: "webhookSecret", label: "Webhook 签名密钥（whsec_…）", secret: true },
  { key: "publishableKey", label: "Publishable Key（pk_…，选填）", secret: false },
] as const;

/** 渠道配置 → Stripe SDK 密钥覆盖（留空字段跟随环境变量） */
function keysFrom(config: Record<string, unknown>): StripeKeysOverride {
  return {
    secretKey: str(config, "secretKey") || undefined,
    webhookSecret: str(config, "webhookSecret") || undefined,
  };
}

/**
 * StripeProvider —— 渠道化 Stripe Checkout（真实接入级）。
 *
 * 与 legacy 路径（env 密钥，order.service 直连）并存：
 *  - 后台配置并启用 Stripe 渠道后，订单按渠道配置的密钥创建 Checkout Session；
 *  - 未配置渠道时回落 env（effectivePaymentMode 驱动的旧行为不变）。
 * Webhook 建议仍指向 /api/webhooks/stripe（含金额一致性校验），
 * 也可走通用回调 /api/pay/notify/stripe（本 provider 的 verifyNotify）。
 */
export const stripeProvider: PaymentProvider = {
  key: "stripe",

  isConfigured(config) {
    return str(config, "secretKey").length > 0;
  },

  isReady(config) {
    // webhook 是支付确认主链路：缺它则订单只能靠定时对账兜底补标记
    return str(config, "secretKey").length > 0 && str(config, "webhookSecret").length > 0;
  },

  async createPayment(input: CreatePaymentInput, config): Promise<CreatePaymentResult> {
    const { url, sessionId } = await createCheckoutSession(
      {
        orderNumber: input.orderNumber,
        currency: input.currency,
        total: input.total,
        customerEmail: input.customerEmail ?? "",
        accessToken: input.accessToken,
      },
      // 渠道化路径以订单总额单行结算（明细进 Stripe 商品名）
      [{ name: input.subject, quantity: 1, price: input.total }],
      keysFrom(config),
    );
    return { kind: "redirect", url, transactionId: sessionId };
  },

  async verifyNotify(req: NextRequest, config) {
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";
    try {
      const event = constructWebhookEvent(payload, signature, keysFrom(config));
      // 资金审计 D3 修复：通用回调路径此前缺少 payment_status 校验 —— 而 provider
      // 文档明确把「走通用回调 /api/pay/notify/stripe」列为可用配置。异步支付方式
      // （SEPA 借记/Boleto/OXXO/Klarna/ACH）在客户提交收银台的瞬间即触发
      // checkout.session.completed，此刻 payment_status 仍是 unpaid、钱未到账
      // （凭证类甚至可能永远不到账）——不校验就置 PAID 并发货 = 客户凭一张凭证白拿货。
      // 与 webhook 路径（src/app/api/webhooks/stripe/route.ts 的 UNPAID 分支）同口径：
      // 未到账返回 skipReason（调用方回 success 停止重试但不认账），由后续
      // async_payment_succeeded 事件驱动。
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object as {
          id: string;
          payment_intent?: string | { id: string } | null;
          amount_total?: number | null;
          currency?: string | null;
          payment_status?: string | null;
          metadata?: Record<string, string> | null;
        };
        const orderNumber = session.metadata?.orderNumber ?? "";
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        if (!orderNumber || !paymentIntentId) return null;
        const result = {
          orderNumber,
          // Checkout Session 是会话，不是支付交易。paymentId 只能保存 PaymentIntent。
          transactionId: paymentIntentId,
          amount: (session.amount_total ?? 0) / 100,
          currency: session.currency ?? undefined,
          sessionId: session.id,
        };
        if (session.payment_status !== "paid") {
          return { ...result, skipReason: `unpaid:${session.payment_status ?? "unknown"}` };
        }
        return result;
      }
      if (event.type === "payment_intent.succeeded") {
        const intent = event.data.object as {
          id: string;
          amount?: number | null;
          currency?: string | null;
          metadata?: Record<string, string> | null;
        };
        const orderNumber = intent.metadata?.orderNumber ?? "";
        if (!orderNumber) return null;
        return {
          orderNumber,
          transactionId: intent.id,
          amount: (intent.amount ?? 0) / 100,
          currency: intent.currency ?? undefined,
        };
      }
      return null;
    } catch {
      return null;
    }
  },

  async refund(input, config) {
    if (!input.gatewayId) {
      throw badRequest("Missing Stripe Payment Intent ID — cannot issue a gateway refund");
    }
    const r = await createStripeRefund(
      input.gatewayId,
      input.amount,
      keysFrom(config),
      input.idempotencyKey,
    );
    return {
      gatewayRefundId: r.id,
      status:
        r.status === "succeeded"
          ? "succeeded"
          : r.status === "failed" || r.status === "canceled"
            ? "failed"
            : "pending",
    };
  },
};
