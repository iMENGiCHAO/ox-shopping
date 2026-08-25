import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { json } from "@/lib/api";
import { constructWebhookEvent } from "@/lib/payment/stripe";
import { markOrderPaid, updateOrderStatus } from "@/server/services/order.service";
import { audit } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe
 * 不用 apiHandler：签名错误必须返回 400(Stripe 会重试)。
 */
export async function POST(req: Request) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  try {
    const event = constructWebhookEvent(payload, sig);

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
          if (order && order.status !== "REFUNDED") {
            try {
              await updateOrderStatus(order, "REFUNDED", null);
            } catch (err) {
              // 状态机不允许时忽略(订单已处终态等)
              logError(err, req, { context: "charge.refunded updateOrderStatus" });
            }
            await prisma.refund.updateMany({
              where: { orderId: order.id, status: { not: "REFUNDED" } },
              data: { status: "REFUNDED" },
            });
          }
        }
        break;
      }
    }

    return json({ received: true });
  } catch (err) {
    logError(err, req, { context: "stripe webhook" });
    return NextResponse.json({ error: "Webhook 事件构造失败" }, { status: 400 });
  }
}
