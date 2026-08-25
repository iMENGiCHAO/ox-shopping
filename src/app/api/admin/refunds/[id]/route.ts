import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/session";
import { updateOrderStatus } from "@/server/services/order.service";
import { serializeRefund } from "@/server/serializers";
import { createStripeRefund } from "@/lib/payment/stripe";
import { effectivePaymentMode } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { formatMoney } from "@/lib/utils";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const refundDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  adminNote: z.string().trim().max(500).optional().nullable(),
});

/** PUT /api/admin/refunds/[id] — 退款审核 */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = Array.isArray(ctx.params.id) ? ctx.params.id[0]! : ctx.params.id;
  const input = await readJson(req, refundDecisionSchema);

  const refund = await prisma.refund.findUnique({
    where: { id },
    include: { order: { include: { items: true } }, user: true },
  });
  if (!refund) throw notFound("退款申请不存在");

  const orderUrl = `${env.SITE_URL}/orders/${refund.order.orderNumber}`;

  if (input.decision === "approve") {
    if (Number(refund.amount) > Number(refund.order.total)) {
      throw badRequest("退款金额不能超过订单金额");
    }

    // Stripe 模式：发起线上退款
    if (effectivePaymentMode === "stripe" && refund.order.paymentId) {
      try {
        await createStripeRefund(refund.order.paymentId, Number(refund.amount));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "未知错误";
        throw badRequest(`退款失败：${msg}`);
      }
    }

    const updated = await prisma.refund.update({
      where: { id },
      data: { status: "REFUNDED", adminNote: input.adminNote ?? null },
    });

    // 订单若可流转则标记为已退款(状态机不允许时忽略)
    try {
      if (refund.order.status !== "REFUNDED") {
        await updateOrderStatus(refund.order, "REFUNDED", { id: actor.id, name: actor.name });
      }
    } catch {
      /* 状态机不允许时忽略：Refund 已 REFUNDED 即可 */
    }

    await sendMail({
      to: refund.user.email,
      template: "refund-update",
      data: {
        name: refund.user.name,
        orderNumber: refund.order.orderNumber,
        statusText: "已退款",
        amount: formatMoney(Number(refund.amount), refund.order.currency),
        note: input.adminNote ?? undefined,
        orderUrl,
      },
    });
    await audit({
      userId: actor.id,
      action: "REFUND_APPROVE",
      entity: "Refund",
      entityId: refund.id,
      meta: { orderNumber: refund.order.orderNumber, amount: Number(refund.amount) },
      req,
    });
    return json({ refund: serializeRefund(updated) });
  }

  // reject
  const updated = await prisma.refund.update({
    where: { id },
    data: { status: "REJECTED", adminNote: input.adminNote ?? null },
  });

  await sendMail({
    to: refund.user.email,
    template: "refund-update",
    data: {
      name: refund.user.name,
      orderNumber: refund.order.orderNumber,
      statusText: "已拒绝",
      amount: formatMoney(Number(refund.amount), refund.order.currency),
      note: input.adminNote ?? undefined,
      orderUrl,
    },
  });
  await audit({
    userId: actor.id,
    action: "REFUND_REJECT",
    entity: "Refund",
    entityId: refund.id,
    meta: { orderNumber: refund.order.orderNumber },
    req,
  });
  return json({ refund: serializeRefund(updated) });
});
