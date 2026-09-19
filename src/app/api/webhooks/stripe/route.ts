import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { json } from "@/lib/api";
import { constructWebhookEvent } from "@/lib/payment/stripe";
import { getChannelRuntimeByCode } from "@/lib/payment/channel.service";
import { str } from "@/lib/payment/provider";
import { markOrderPaid, markOrderRefundedByGateway } from "@/server/services/order.service";
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

  // 渠道化 Stripe：后台配置并启用了 stripe 渠道时优先用渠道密钥验签；否则回落 env
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
    /* DB 异常时回落 env 密钥 */
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, sig, keys);
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
          // 资金安全：校验网关侧支付金额与币种是否与订单一致，
          // 防止篡改 session / 币种错配导致低价成交
          const order = await prisma.order.findUnique({ where: { orderNumber } });
          if (!order) {
            logError(new Error(`订单不存在: ${orderNumber}`), req, {
              context: "stripe checkout.session.completed",
            });
            return NextResponse.json({ error: "订单不存在" }, { status: 400 });
          }
          const expectedCents = Math.round(Number(order.total) * 100);
          if (session.amount_total !== expectedCents) {
            logError(
              new Error(`支付金额不匹配: 网关=${session.amount_total}分, 订单=${expectedCents}分`),
              req,
              { context: "stripe checkout.session.completed amount_mismatch" },
            );
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
            return NextResponse.json({ error: "支付金额与订单不一致" }, { status: 400 });
          }
          if (
            session.currency &&
            order.currency &&
            session.currency.toLowerCase() !== order.currency.toLowerCase()
          ) {
            logError(
              new Error(`支付币种不匹配: 网关=${session.currency}, 订单=${order.currency}`),
              req,
              { context: "stripe checkout.session.completed currency_mismatch" },
            );
            return NextResponse.json({ error: "支付币种与订单不一致" }, { status: 400 });
          }
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
            // 取本次退款的 gateway refund ID（charge.refunds 数组中最新的一条）
            const latestRefund =
              Array.isArray(charge.refunds?.data) && charge.refunds.data.length > 0
                ? charge.refunds.data[charge.refunds.data.length - 1]
                : null;
            if (refundedTotal >= Number(order.total) - 1e-9 && order.status !== "REFUNDED") {
              try {
                // 用 markOrderRefundedByGateway 而非 updateOrderStatus→refundEntireOrder：
                // 退款已在网关侧发生，不应再次发起 Stripe 退款（否则重复退款）
                await markOrderRefundedByGateway(order, latestRefund?.id ?? null);
              } catch (err) {
                // 状态机不允许时忽略(订单已处终态等)
                logError(err, req, { context: "charge.refunded markOrderRefundedByGateway" });
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
