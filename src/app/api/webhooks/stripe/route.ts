import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { json } from "@/lib/api";
import { constructWebhookEvent } from "@/lib/payment/stripe";
import { markOrderPaid, updateOrderStatus } from "@/server/services/order.service";
import { audit } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { captureException } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe
 * 不用 apiHandler：签名错误必须返回 400(Stripe 会重试)。
 */
export async function POST(req: Request) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, sig);
  } catch (err) {
    // 签名/构造失败：Stripe 对 4xx 不重试，返回 400 属正确语义
    logError(err, req, { context: "stripe webhook signature" });
    return NextResponse.json({ error: "Webhook 签名校验失败" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderNumber = session.metadata?.orderNumber;
        if (orderNumber) {
          const paymentIntent =
            typeof session.payment_intent === "string" ? session.payment_intent : undefined;
          await markOrderPaid(orderNumber, paymentIntent);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await audit({
          action: "STRIPE_PAYMENT_FAILED",
          entity: "PaymentIntent",
          entityId: pi.id,
          meta: { orderNumber: pi.metadata?.orderNumber },
          req,
        });
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntent =
          typeof charge.payment_intent === "string" ? charge.payment_intent : undefined;
        if (paymentIntent) {
          const order = await prisma.order.findFirst({
            where: { paymentId: paymentIntent },
            include: { items: true },
          });
          if (order) {
            // 部分退款不改整单状态：仅当累计已退金额覆盖订单总额时才置 REFUNDED
            const agg = await prisma.refund.aggregate({
              where: { orderId: order.id, status: "REFUNDED" },
              _sum: { amount: true },
            });
            const refundedTotal = Number(agg._sum.amount ?? 0);
            if (refundedTotal >= Number(order.total) - 1e-9 && order.status !== "REFUNDED") {
              try {
                await updateOrderStatus(order, "REFUNDED", null);
              } catch (err) {
                // 状态机不允许时忽略(订单已处终态等)
                logError(err, req, { context: "charge.refunded updateOrderStatus" });
              }
            }
          }
        }
        break;
      }
    }

    return json({ received: true });
  } catch (err) {
    // 事件处理失败：返回 5xx 让 Stripe 按退避策略重试（掉单对账任务兜底）
    logError(err, req, { context: "stripe webhook processing", type: event.type });
    captureException(err, { url: req.url, webhookType: event.type });
    return NextResponse.json({ error: "Webhook 事件处理失败" }, { status: 500 });
  }
}
