import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, conflict, rateLimited } from "@/lib/errors";
import { requireOrderAccess, orderContact } from "@/server/services/order-access";
import { serializeRefund } from "@/server/serializers";
import { audit } from "@/lib/audit";
import { logPayment } from "@/server/services/payment-log.service";
import { createNotification, notifyAdmins } from "@/server/services/notification.service";
import { prisma } from "@/lib/prisma";
import { refundRequestSchema } from "@/lib/validations/cart-order";
import { REFUNDABLE_STATUSES } from "@/lib/order-status";
// COD 封顶含到付费（资金审计 M5）：与审批端/整单退款同一口径
import { refundableCeiling } from "@/server/services/order.service";
import { routeParam } from "@/app/api/_lib/params";
import { sanitizePlainText } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { getClientIp } from "@/lib/server/utils-server";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/refund — 申请退款 */
export const POST = apiHandler(async (req, ctx) => {
  const input = await readJson(req, refundRequestSchema);
  const orderNumber = routeParam(ctx.params.orderNumber);

  // 权限审计修复：每笔申请都 notifyAdmins 刷后台待办——攻击者持 N 个游客单
  // token 可逐单无限刷管理员通知队列。按订单限流（游客场景叠加 IP 桶）。
  const { order, user } = await requireOrderAccess(req, orderNumber);
  const rlKey = user ? `refund-req:${orderNumber}` : `refund-req:${orderNumber}:${getClientIp(req)}`;
  const rl = await rateLimit({ key: rlKey, ...RATE_LIMITS.refundRequest });
  if (!rl.ok) throw rateLimited("Too many refund requests, please try again later");

  if (!REFUNDABLE_STATUSES.includes(order.status)) {
    throw badRequest("This order is not eligible for a refund in its current state");
  }
  // COD（货到付款）语义守卫（业务闭环审计建议#3）：未发货的 COD 单没有线上
  // 资金往来 —— 顾客没付过钱，走「退款」会被置成 SUCCEEDED（拿一张假的
  // 「已退款」凭证）。正确语义是取消（订单/库存/券回补），取消入口本来就
  // 支持 COD PROCESSING —— 在申请入口直接引导。
  // SHIPPED 也纳入（订单审计缺陷5）：货在途且未收款，系统标「已退款」会同时
  // 触发库存回补 → 账实不符、可能重复销售；正确语义是先拦截包裹再取消。
  if (order.isCashOnDelivery && ["PROCESSING", "SHIPPED"].includes(order.status)) {
    throw badRequest(
      "Cash-on-delivery orders that have not shipped have no payment to refund — please cancel the order instead",
    );
  }
  if (input.amount <= 0) {
    throw badRequest("Refund amount must be greater than 0");
  }

  // reason 净化：去除 HTML（admin 后台默认 React 转义，这里是纵深防御）
  const cleanReason = (await sanitizePlainText(input.reason)).trim().slice(0, 500);
  if (cleanReason.length < 5) throw badRequest("Refund reason must be at least 5 characters");

  // 事务：行锁订单 + 累计所有「生效中」退款计入可退占用。
  // FAILED 也必须计入（商用审计修复）：网关超时时本地置 FAILED，但 Stripe 侧可能
  // 已扣款且 outbox 会重试复活——不计入则用户/管理员可按剩余额度再申请，累计超实付。
  const refund = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
    const sumResult = await tx.refund.aggregate({
      where: {
        orderId: order.id,
        // PENDING（网关已受理待确认）必须计入占用：审批端与整单退款端口径都含它，
        // 漏掉会让用户看到「可退额度」大于实际可批准额度 —— 提出永远批不过的申请
        status: { in: ["REQUESTED", "APPROVED", "PENDING", "REFUNDED", "FAILED"] },
      },
      _sum: { amount: true },
    });
    const usedSoFar = Number(sumResult._sum.amount ?? 0);
    if (input.amount + usedSoFar > refundableCeiling(order) + 1e-9) {
      throw badRequest(
        `Refund amount exceeds the refundable total: refundable total ${refundableCeiling(order).toFixed(2)}, already refunded/reserved ${usedSoFar.toFixed(2)}`,
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

