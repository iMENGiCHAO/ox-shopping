import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { json } from "@/lib/api";
import {
  claimStripeWebhookEvent,
  constructWebhookEvent,
  failStripeWebhookEvent,
  finishStripeWebhookEvent,
  recordStripeGatewayRefund,
} from "@/lib/payment/stripe";
import { getChannelRuntimeByCode } from "@/lib/payment/channel.service";
import { str } from "@/lib/payment/provider";
import { markOrderPaid, markOrderRefundedByGateway } from "@/server/services/order.service";
import { distributionBridge } from "@/server/services/distribution/bridge";
import { audit } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { captureException, captureMessage } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

class WebhookIgnoredError extends Error {}

async function processChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntent =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntent) return;

  const order = await prisma.order.findFirst({
    where: { paymentId: paymentIntent },
    include: { items: true },
  });
  if (!order) return;

  // Stripe may deliver Refund A/B events in either order and each Charge snapshot can
  // contain several refunds. Process every succeeded refund by its own refund.id, then
  // decide from the transaction-visible aggregate; never trust list order or event order.
  const succeededRefunds = (charge.refunds?.data ?? []).filter(
    (refund): refund is Stripe.Refund => refund.status === "succeeded",
  );
  if (succeededRefunds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
    for (const gatewayRefund of succeededRefunds) {
      await recordStripeGatewayRefund({
        orderId: order.id,
        userId: order.userId,
        refundId: gatewayRefund.id,
        amountMinor: gatewayRefund.amount,
        localIdempotencyKey: gatewayRefund.metadata?.idempotencyKey,
        client: tx,
      });
    }
  });

  const completed = await prisma.refund.aggregate({
    where: { orderId: order.id, status: "REFUNDED" },
    _sum: { amount: true },
  });
  const refundedTotal = Number(completed._sum.amount ?? 0);
  if (refundedTotal >= Number(order.total) - 1e-9 && order.status !== "REFUNDED") {
    await markOrderRefundedByGateway(
      order,
      succeededRefunds[succeededRefunds.length - 1]?.id ?? null,
    );
  } else {
    await distributionBridge.onOrderRefunded(order.id);
  }
}

/** POST /api/webhooks/stripe — verify signature, claim event.id, then process exactly once. */
export async function POST(req: Request) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let keys: { secretKey?: string; webhookSecret?: string } | undefined;
  try {
    const channel = await getChannelRuntimeByCode("stripe");
    if (channel?.enabled) {
      keys = {
        secretKey: str(channel.config, "secretKey") || undefined,
        webhookSecret: str(channel.config, "webhookSecret") || undefined,
      };
    }
  } catch {
    // DB unavailable: fall back to environment credentials; the later claim will retry/fail loudly.
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, sig, keys);
  } catch (err) {
    logError(err, req, { context: "stripe webhook signature" });
    return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 });
  }

  let claim: Awaited<ReturnType<typeof claimStripeWebhookEvent>>;
  try {
    claim = await claimStripeWebhookEvent({ eventId: event.id, type: event.type });
  } catch (err) {
    logError(err, req, { context: "stripe webhook claim", type: event.type });
    return NextResponse.json({ error: "Webhook event claim failed" }, { status: 500 });
  }
  if (claim.state === "DUPLICATE") return json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderNumber = session.metadata?.orderNumber;
        if (!orderNumber) throw new WebhookIgnoredError("Missing order number");

        // 商用审计修复（2026-09-26）：异步支付方式（SEPA 借记/Boleto/OXXO/Klarna/ACH）
        // 在客户「提交」收银台时即触发本事件，此刻 payment_status 仍为 unpaid、钱未到账
        // （凭证类可能永远不到账）。不校验就置 PAID = 客户凭一张凭证白拿货发货。
        // unpaid 会话交由 async_payment_succeeded / async_payment_failed 后续事件驱动。
        if (session.payment_status !== "paid") {
          await audit({
            action: "STRIPE_SESSION_UNPAID",
            entity: "Order",
            entityId: orderNumber,
            meta: {
              orderNumber,
              paymentStatus: session.payment_status,
              note: "异步支付方式未到账，等待 async_payment_* 事件",
            },
            req,
          });
          throw new WebhookIgnoredError(
            `Session not paid yet (payment_status=${session.payment_status})`,
          );
        }

        const order = await prisma.order.findUnique({ where: { orderNumber } });
        if (!order) throw new WebhookIgnoredError(`Order not found: ${orderNumber}`);

        const expectedCents = Math.round(Number(order.total) * 100);
        if (session.amount_total !== expectedCents) {
          await audit({
            action: "STRIPE_AMOUNT_MISMATCH",
            entity: "Order",
            entityId: order.id,
            meta: {
              orderNumber,
              gatewayAmount: session.amount_total,
              expectedAmount: expectedCents,
            },
            req,
          });
          throw new WebhookIgnoredError("Payment amount does not match order");
        }
        if (
          session.currency &&
          order.currency &&
          session.currency.toLowerCase() !== order.currency.toLowerCase()
        ) {
          throw new WebhookIgnoredError("Payment currency does not match order");
        }
        const paymentIntent =
          typeof session.payment_intent === "string" ? session.payment_intent : undefined;
        await markOrderPaid(orderNumber, paymentIntent);
        break;
      }

      // 异步支付方式（SEPA/Boleto/OXXO/Klarna/ACH）到账成功：此事件才代表钱真正收到。
      // 校验口径与 completed(paid) 完全一致（金额按分精确比对 + 币种一致）。
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderNumber = session.metadata?.orderNumber;
        if (!orderNumber) throw new WebhookIgnoredError("Missing order number");
        if (session.payment_status !== "paid") {
          throw new WebhookIgnoredError("async_payment_succeeded without paid status");
        }
        const order = await prisma.order.findUnique({ where: { orderNumber } });
        if (!order) throw new WebhookIgnoredError(`Order not found: ${orderNumber}`);
        const expectedCents = Math.round(Number(order.total) * 100);
        if (session.amount_total !== expectedCents) {
          await audit({
            action: "STRIPE_AMOUNT_MISMATCH",
            entity: "Order",
            entityId: order.id,
            meta: {
              orderNumber,
              gatewayAmount: session.amount_total,
              expectedAmount: expectedCents,
              event: "async_payment_succeeded",
            },
            req,
          });
          throw new WebhookIgnoredError("Payment amount does not match order");
        }
        if (
          session.currency &&
          order.currency &&
          session.currency.toLowerCase() !== order.currency.toLowerCase()
        ) {
          throw new WebhookIgnoredError("Payment currency does not match order");
        }
        const paymentIntent =
          typeof session.payment_intent === "string" ? session.payment_intent : undefined;
        await markOrderPaid(orderNumber, paymentIntent);
        break;
      }

      // 异步支付方式最终失败（凭证过期/借记被拒等）：订单维持待支付直至订单过期
      // 自动取消；这里告警留痕，供客服提前联系客户改用即时支付方式。
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await audit({
          action: "STRIPE_ASYNC_PAYMENT_FAILED",
          entity: "Order",
          entityId: session.metadata?.orderNumber ?? "unknown",
          meta: {
            orderNumber: session.metadata?.orderNumber,
            paymentStatus: session.payment_status,
          },
          req,
        });
        captureMessage(
          `[pay] 异步支付失败（订单 ${session.metadata?.orderNumber ?? "?"}，会话 ${session.id}）—— 客户未完成支付，订单将按超时规则自动取消`,
          "warning",
        );
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

      case "charge.refunded":
        await processChargeRefunded(event.data.object as Stripe.Charge);
        break;

      default:
        throw new WebhookIgnoredError(`Unsupported Stripe event type: ${event.type}`);
    }

    await finishStripeWebhookEvent(event.id, "PROCESSED");
    return json({ received: true });
  } catch (err) {
    if (err instanceof WebhookIgnoredError) {
      await finishStripeWebhookEvent(event.id, "IGNORED");
      // The event was verified and deliberately classified; acknowledge it so Stripe
      // does not retry a permanent business mismatch forever.
      return json({ received: true, ignored: true });
    }
    await failStripeWebhookEvent(event.id, err).catch(() => undefined);
    logError(err, req, { context: "stripe webhook processing", type: event.type });
    captureException(err, { url: req.url, webhookType: event.type });
    return NextResponse.json({ error: "Webhook event processing failed" }, { status: 500 });
  }
}
