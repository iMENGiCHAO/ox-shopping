import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, conflict } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { assertOrderOwner, getOrderByNumber } from "@/server/services/order.service";
import { serializeRefund } from "@/server/serializers";
import { audit } from "@/lib/audit";
import { logPayment } from "@/server/services/payment-log.service";
import { createNotification, notifyAdmins } from "@/server/services/notification.service";
import { prisma } from "@/lib/prisma";
import { refundRequestSchema } from "@/lib/validations/cart-order";
import { REFUNDABLE_STATUSES } from "@/lib/order-status";
import { routeParam } from "@/app/api/_lib/params";
import { sanitizePlainText } from "@/lib/sanitize";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/refund — 申请退款 */
export const POST = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const input = await readJson(req, refundRequestSchema);
  const orderNumber = routeParam(ctx.params.orderNumber);

  const order = await getOrderByNumber(orderNumber);
  assertOrderOwner(order, user.id);

  if (!REFUNDABLE_STATUSES.includes(order.status)) {
    throw badRequest("当前订单状态不可申请退款");
  }
  if (input.amount <= 0) {
    throw badRequest("退款金额必须大于 0");
  }

  // reason 净化：去除 HTML（admin 后台默认 React 转义，这里是纵深防御）
  const cleanReason = (await sanitizePlainText(input.reason)).trim().slice(0, 500);
  if (cleanReason.length < 5) throw badRequest("退款原因至少 5 个字符");

  // 事务：行锁订单 + 累计所有「生效中」退款（REQUESTED/APPROVED/REFUNDED 均计入可退占用）
  const refund = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
    const sumResult = await tx.refund.aggregate({
      where: {
        orderId: order.id,
        status: { in: ["REQUESTED", "APPROVED", "REFUNDED"] },
      },
      _sum: { amount: true },
    });
    const usedSoFar = Number(sumResult._sum.amount ?? 0);
    if (input.amount + usedSoFar > Number(order.total) + 1e-9) {
      throw badRequest(
        `超出可退金额：订单总额 ${Number(order.total).toFixed(2)}，已占用/已退 ${usedSoFar.toFixed(2)}`,
      );
    }

    // 同一订单已有 PENDING 申请，禁止重复提交
    const existing = await tx.refund.findFirst({
      where: { orderId: order.id, status: "REQUESTED" },
    });
    if (existing) throw conflict("已有待审核的退款申请");

    return tx.refund.create({
      data: {
        orderId: order.id,
        userId: user.id,
        reason: cleanReason,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
      },
    });
  });

  void logPayment({
    orderId: order.id,
    provider: order.paymentProvider ?? "unknown",
    event: "refund_requested",
    amount: input.amount,
    payload: { refundId: refund.id, reason: cleanReason },
  });

  await audit({
    userId: user.id,
    action: "REFUND_REQUEST",
    entity: "Refund",
    entityId: refund.id,
    meta: { orderNumber, amount: input.amount },
    req,
  });

  // 站内消息：通知所有管理员（admin / support）有新的退款待审批
  const amountStr = input.amount.toFixed(2);
  void notifyAdmins({
    type: "refund",
    title: `新退款申请 ${amountStr}`,
    titleEn: `New refund request ${amountStr}`,
    body: `${user.name}（${user.email}）申请订单 ${orderNumber} 退款 ${amountStr}。原因：${cleanReason}`,
    bodyEn: `${user.name} (${user.email}) requested a refund of ${amountStr} for order ${orderNumber}. Reason: ${cleanReason}`,
    link: `/admin/refunds`,
    meta: { refundId: refund.id, orderNumber, amount: input.amount },
  });

  // 站内消息：通知客户自己"申请已收到"（消除孤岛：客户不只在 admin 审批后才收到通知）
  void createNotification({
    userId: user.id,
    type: "refund",
    title: "退款申请已提交",
    titleEn: "Refund request submitted",
    body: `订单 ${orderNumber} 的退款申请 ${amountStr} 已提交，我们会在 1-3 个工作日内审核。`,
    bodyEn: `Your refund request of ${amountStr} for order ${orderNumber} has been submitted. We'll review it within 1-3 business days.`,
    link: `/orders/${orderNumber}`,
    meta: { refundId: refund.id, orderNumber, amount: input.amount, status: "REQUESTED" },
  });

  return json({ refund: serializeRefund(refund) });
});

