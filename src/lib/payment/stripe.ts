import "server-only";
import Stripe from "stripe";
import { env, effectivePaymentMode } from "@/lib/env";
import { toCents } from "@/lib/utils";
import { formatMoney } from "@/lib/utils";

/**
 * Stripe 支付。
 * 未配置密钥时 effectivePaymentMode === "mock"，走内置模拟支付(见 payment/mock.ts)。
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
}

/** 创建 Stripe Checkout Session，返回跳转 URL */
export async function createCheckoutSession(
  order: CheckoutOrderInfo,
  items: CheckoutItem[],
): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe 未配置");

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
    success_url: `${env.SITE_URL}/checkout/result?orderNumber=${order.orderNumber}&status=success`,
    cancel_url: `${env.SITE_URL}/checkout/result?orderNumber=${order.orderNumber}&status=cancelled`,
  });

  if (!session.url) throw new Error("Stripe 未返回 Checkout URL");
  return session.url;
}

/** 校验 Webhook 签名并构造事件(签名错误抛错 → 上层返回 400) */
export function constructWebhookEvent(payload: string, signature: string): Stripe.Event {
  const stripe = getStripe();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("Stripe webhook 未配置");
  }
  return stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
}

/** Stripe 退款(支付成功后订单退款) */
export async function createStripeRefund(
  paymentIntentId: string,
  amountYuan: number,
): Promise<Stripe.Refund> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe 未配置");
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: toCents(amountYuan),
  });
}

export { effectivePaymentMode, formatMoney };
