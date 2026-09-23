import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, conflict } from "@/lib/errors";
import { requireOrderAccess, orderContact } from "@/server/services/order-access";
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
  const input = await readJson(req, refundRequestSchema);
  const orderNumber = routeParam(ctx.params.orderNumber);

  const { order, user } = await requireOrderAccess(req, orderNumber);

  if (!REFUNDABLE_STATUSES.includes(order.status)) {
    throw badRequest("This order is not eligible for a refund in its current state");
  }
  if (input.amount <= 0) {
    throw badRequest("Refund amount must be greater than 0");
  }

  // reason 净化：去除 HTML（admin 后台默认 React 转义，这里是纵深防御）
  const cleanReason = (await sanitizePlainText(input.reason)).trim().slice(0, 500);
  if (cleanReason.length < 5) throw badRequest("Refund reason must be at least 5 characters");

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
        `Refund amount exceeds the refundable total: order total ${Number(order.total).toFixed(2)}, already refunded/reserved ${usedSoFar.toFixed(2)}`,
      );
    }

    // 同一订单已有 PENDING 申请，禁止重复提交
    const existing = await tx.refund.findFirst({
      where: { orderId: order.id, status: "REQUESTED" },
    });
    if (existing) throw conflict("You already have a pending refund request");

    return tx.refund.create({
      data: {
        orderId: order.id,
        // 游客单无账号可归属，退款记录记 userId=null（订单号 + 联系邮箱仍可溯源）
        userId: user?.id ?? null,
        reason: cleanReason,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        idempotencyKey: `refund_request_${crypto.randomUUID()}`,
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
    userId: user?.id ?? null,
    action: "REFUND_REQUEST",
    entity: "Refund",
    entityId: refund.id,
    meta: { orderNumber, amount: input.amount },
    req,
  });

  // 站内消息：通知所有管理员（admin / support）有新的退款待审批
  const amountStr = input.amount.toFixed(2);
  // 申请人展示信息：登录单用账号，游客单用订单收货人 + 联系邮箱
  const applicant = user ?? orderContact(order);
  void notifyAdmins({
    type: "refund",
    title: `新退款申请 ${amountStr}`,
    titleEn: `New refund request ${amountStr}`,
    body: `${applicant.name}（${applicant.email}）申请订单 ${orderNumber} 退款 ${amountStr}。原因：${cleanReason}`,
    bodyEn: `${applicant.name} (${applicant.email}) requested a refund of ${amountStr} for order ${orderNumber}. Reason: ${cleanReason}`,
    link: `/admin/refunds`,
    meta: { refundId: refund.id, orderNumber, amount: input.amount },
  });

  // 站内消息：通知客户自己"申请已收到"（消除孤岛：客户不只在 admin 审批后才收到通知）
  void createNotification({
    // 游客单无站内消息中心，createNotification 内部会跳过
    userId: user?.id ?? null,
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

