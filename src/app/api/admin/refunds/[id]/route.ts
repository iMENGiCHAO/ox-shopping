import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/session";
import { approveRefund, orderUrlFor, greetingName } from "@/server/services/order.service";
import { serializeRefund } from "@/server/serializers";
import { effectivePaymentMode } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { logPayment } from "@/server/services/payment-log.service";
import { createNotification } from "@/server/services/notification.service";
import { formatMoney } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { sanitizePlainText } from "@/lib/sanitize";
import { z } from "zod";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const refundDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  adminNote: z.string().trim().max(500).optional().nullable(),
});

async function sendRefundMail(
  refund: {
    amount: unknown;
    order: {
      orderNumber: string;
      currency: string;
      contactEmail: string | null;
      accessToken: string | null;
      addressSnapshot: unknown;
    };
    user: { name: string; email: string } | null;
  },
  opts: { statusText: string; note?: string; orderUrl: string },
): Promise<void> {
  const to = refund.order.contactEmail ?? refund.user?.email ?? null;
  if (!to) return;
  await sendMail({
    to,
    template: "refund-update",
    data: {
      name: greetingName(refund.user?.name, refund.order),
      orderNumber: refund.order.orderNumber,
      statusText: opts.statusText,
      amount: formatMoney(Number(refund.amount), refund.order.currency),
      note: opts.note,
      orderUrl: opts.orderUrl,
    },
  });
}

/** PUT /api/admin/refunds/[id] — 审核；approve 只创建/推进 outbox，不冒充网关成功。 */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = Array.isArray(ctx.params.id) ? ctx.params.id[0]! : ctx.params.id;
  const raw = await readJson(req, refundDecisionSchema);
  const input = {
    ...raw,
    adminNote: raw.adminNote
      ? (await sanitizePlainText(raw.adminNote)).trim().slice(0, 500) || null
      : null,
  };

  const refund = await prisma.refund.findUnique({
    where: { id },
    include: { order: { include: { items: true } }, user: true },
  });
  if (!refund) throw notFound("退款申请不存在");

  const orderUrl = orderUrlFor(refund.order);
  const refundProviderKey = refund.order.paymentProvider ?? effectivePaymentMode;

  if (input.decision === "approve") {
    const result = await approveRefund(refund.id, { adminNote: input.adminNote });
    const updated = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    const succeeded = result.state === "SUCCEEDED";
    const statusText = succeeded
      ? "已退款"
      : result.state === "FAILED"
        ? "退款失败，待重试"
        : "退款处理中";

    if (succeeded) {
      void logPayment({
        orderId: refund.orderId,
        provider: refundProviderKey,
        event: "refunded",
        amount: Number(refund.amount),
        gatewayId: result.gatewayRefundId,
        payload: { refundId: refund.id, idempotencyKey: refund.idempotencyKey },
      });
    } else {
      logger.error(
        {
          refundId: refund.id,
          orderId: refund.orderId,
          state: result.state,
          error: result.state === "FAILED" ? result.error : undefined,
        },
        "退款尚未成功，保留 outbox 重试且不冲正分销",
      );
    }

    await sendRefundMail(refund, {
      statusText,
      note: input.adminNote ?? undefined,
      orderUrl,
    });
    await audit({
      userId: actor.id,
      action: "REFUND_APPROVE",
      entity: "Refund",
      entityId: refund.id,
      meta: {
        orderNumber: refund.order.orderNumber,
        amount: Number(refund.amount),
        state: result.state,
      },
      req,
    });
    if (refund.userId) {
      void createNotification({
        userId: refund.userId,
        type: "refund",
        title: succeeded ? "退款已完成" : "退款处理中",
        titleEn: succeeded ? "Refund completed" : "Refund processing",
        body: `订单 ${refund.order.orderNumber} 的退款 ${formatMoney(Number(refund.amount), refund.order.currency)} 当前状态：${statusText}。`,
        bodyEn: `Your refund of ${formatMoney(Number(refund.amount), refund.order.currency)} for order ${refund.order.orderNumber} is ${statusText}.`,
        link: `/orders/${refund.order.orderNumber}`,
        meta: {
          orderNumber: refund.order.orderNumber,
          refundId: refund.id,
          amount: Number(refund.amount),
          status: updated.status,
        },
      });
    }
    return json(
      { refund: serializeRefund(updated), state: result.state },
      { status: succeeded ? 200 : 202 },
    );
  }

  const rejected = await prisma.refund.updateMany({
    where: { id, status: "REQUESTED" },
    data: { status: "REJECTED", adminNote: input.adminNote ?? null },
  });
  if (rejected.count === 0) throw badRequest("该退款申请已处理，请勿重复操作");
  const updated = await prisma.refund.findUniqueOrThrow({ where: { id } });

  void logPayment({
    orderId: refund.orderId,
    provider: refundProviderKey,
    event: "refund_rejected",
    amount: Number(refund.amount),
    payload: { refundId: refund.id, admin: actor.email },
  });
  await sendRefundMail(refund, {
    statusText: "已拒绝",
    note: input.adminNote ?? undefined,
    orderUrl,
  });
  await audit({
    userId: actor.id,
    action: "REFUND_REJECT",
    entity: "Refund",
    entityId: refund.id,
    meta: { orderNumber: refund.order.orderNumber },
    req,
  });
  if (refund.userId) {
    void createNotification({
      userId: refund.userId,
      type: "refund",
      title: "退款申请被拒",
      titleEn: "Refund rejected",
      body: `订单 ${refund.order.orderNumber} 的退款申请被拒绝${input.adminNote ? `（理由：${input.adminNote}）` : ""}。如有疑问请联系客服。`,
      bodyEn: `Your refund request for order ${refund.order.orderNumber} has been rejected${input.adminNote ? ` (reason: ${input.adminNote})` : ""}. Please contact support if you have questions.`,
      link: `/orders/${refund.order.orderNumber}`,
      meta: {
        orderNumber: refund.order.orderNumber,
        refundId: refund.id,
        amount: Number(refund.amount),
        status: "REJECTED",
      },
    });
  }
  return json({ refund: serializeRefund(updated) });
});
