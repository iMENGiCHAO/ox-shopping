import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/session";
import { updateOrderStatus, orderUrlFor, greetingName } from "@/server/services/order.service";
import { serializeRefund } from "@/server/serializers";
import { createStripeRefund } from "@/lib/payment/stripe";
import { getChannelRuntimeByCode } from "@/lib/payment/channel.service";
import { getProvider } from "@/lib/payment/providers";
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

/**
 * 发送退款进度邮件。
 * 收件人优先取**订单联系邮箱**（游客单只有这个），登录单兜底账号邮箱；
 * 两者皆无时静默跳过——绝不能给邮件服务传空收件人。
 */
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

/** PUT /api/admin/refunds/[id] — 退款审核 */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = Array.isArray(ctx.params.id) ? ctx.params.id[0]! : ctx.params.id;
  const raw = await readJson(req, refundDecisionSchema);
  // adminNote 净化：去 HTML 标签
  const input = {
    ...raw,
    adminNote: raw.adminNote ? (await sanitizePlainText(raw.adminNote)).trim().slice(0, 500) || null : null,
  };

  const refund = await prisma.refund.findUnique({
    where: { id },
    include: { order: { include: { items: true } }, user: true },
  });
  if (!refund) throw notFound("退款申请不存在");

  // 订单详情链接：游客单必须带查询令牌（无账号，否则邮件里的链接点开是登录页）
  const orderUrl = orderUrlFor(refund.order);
  // 订单实际支付渠道（兼容旧 stripe/mock env 模式）
  const refundProviderKey = refund.order.paymentProvider ?? effectivePaymentMode;

  if (input.decision === "approve") {
    // 原子认领：同一退款单并发审批只有一个成功；
    // 同一订单的不同退款单经订单行锁串行化，累计封顶不会并发超退。
    // 累计口径：REQUESTED + APPROVED + REFUNDED（与 /api/orders/[orderNumber]/refund 保持一致）
    const claimedRefund = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${refund.orderId} FOR UPDATE`;
      const prior = await tx.refund.aggregate({
        where: {
          orderId: refund.orderId,
          status: { in: ["REQUESTED", "APPROVED", "REFUNDED"] },
          id: { not: id },
        },
        _sum: { amount: true },
      });
      const soFar = Number(prior._sum.amount ?? 0);
      if (soFar + Number(refund.amount) > Number(refund.order.total) + 1e-9) {
        throw badRequest(
          `累计退款超出订单金额：已占用/已退 ${soFar.toFixed(2)}，本笔 ${Number(refund.amount).toFixed(2)}，` +
            `订单总额 ${Number(refund.order.total).toFixed(2)}`,
        );
      }
      const claimed = await tx.refund.updateMany({
        where: { id, status: "REQUESTED" },
        data: { status: "REFUNDED" },
      });
      if (claimed.count === 0) throw badRequest("该退款申请已处理，请勿重复操作");
      return soFar;
    });

    // 网关退款：按订单支付渠道分发（Stripe 兼容 + payment_channels 渠道）；mock 无网关退款
    let gatewayRefundId: string | null = null;
    try {
      if (refundProviderKey === "stripe" && refund.order.paymentId) {
        const r = await createStripeRefund(refund.order.paymentId, Number(refund.amount));
        gatewayRefundId = r.id;
      } else if (refundProviderKey && refundProviderKey !== "mock") {
        const channel = await getChannelRuntimeByCode(refundProviderKey);
        if (channel && channel.enabled) {
          const provider = getProvider(channel.provider);
          const r = await provider.refund(
            {
              orderNumber: refund.order.orderNumber,
              amount: Number(refund.amount),
              gatewayId: refund.order.paymentId ?? null,
              currency: refund.order.currency,
            },
            channel.config,
          );
          gatewayRefundId = r.gatewayRefundId;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      // 网关失败：回滚认领状态并记录原因，允许管理员重试（不留半途状态）
      await prisma.refund
        .update({
          where: { id },
          data: { status: "REQUESTED", adminNote: `网关退款失败：${msg}` },
        })
        .catch(() => undefined);
      throw badRequest(`退款失败：${msg}`);
    }

    const updated = await prisma.refund.update({
      where: { id },
      data: { adminNote: input.adminNote ?? null, gatewayRefundId },
    });

    // 资金流水：退款完成
    void logPayment({
      orderId: refund.orderId,
      provider: refundProviderKey,
      event: "refunded",
      amount: Number(refund.amount),
      gatewayId: gatewayRefundId,
      payload: { refundId: refund.id },
    });

    // 仅当累计退款覆盖全额时才将整单标记为 REFUNDED；
    // 部分退款保持原状态（订单可继续发货或再次申请退款）
    const cumulative = claimedRefund + Number(refund.amount);
    try {
      if (cumulative >= Number(refund.order.total) - 1e-9 && refund.order.status !== "REFUNDED") {
        // 本路由已在上方完成网关退款 → 只做本地记账（状态 + 库存回补），跳过重复网关退款
        await updateOrderStatus(
          refund.order,
          "REFUNDED",
          { id: actor.id, name: actor.name },
          undefined,
          { skipGatewayRefund: true },
        );
      }
    } catch (err) {
      // 状态机不允许时忽略：Refund 已 REFUNDED 即可
      // 但必须记录 warning，便于事后审计
      logger.warn(
        { err: (err as Error).message, refundId: refund.id, orderId: refund.orderId },
        "[refund] 订单状态更新为 REFUNDED 失败（继续流程）",
      );
    }

    await sendRefundMail(refund, {
      statusText: "已退款",
      note: input.adminNote ?? undefined,
      orderUrl,
    });
    await audit({
      userId: actor.id,
      action: "REFUND_APPROVE",
      entity: "Refund",
      entityId: refund.id,
      meta: { orderNumber: refund.order.orderNumber, amount: Number(refund.amount) },
      req,
    });
    // 站内消息
    void createNotification({
      userId: refund.userId,
      type: "refund",
      title: "退款已批准",
      titleEn: "Refund approved",
      body: `订单 ${refund.order.orderNumber} 的退款 ${formatMoney(
        Number(refund.amount),
        refund.order.currency,
      )} 已批准，请查收。`,
      bodyEn: `Your refund of ${formatMoney(
        Number(refund.amount),
        refund.order.currency,
      )} for order ${refund.order.orderNumber} has been approved.`,
      link: `/orders/${refund.order.orderNumber}`,
      meta: {
        orderNumber: refund.order.orderNumber,
        refundId: refund.id,
        amount: Number(refund.amount),
        status: "REFUNDED",
      },
    });
    return json({ refund: serializeRefund(updated) });
  }

  // reject
  const updated = await prisma.refund.update({
    where: { id },
    data: { status: "REJECTED", adminNote: input.adminNote ?? null },
  });

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
  // 站内消息
  void createNotification({
    userId: refund.userId,
    type: "refund",
    title: "退款申请被拒",
    titleEn: "Refund rejected",
    body: `订单 ${refund.order.orderNumber} 的退款申请被拒绝${
      input.adminNote ? `（理由：${input.adminNote}）` : ""
    }。如有疑问请联系客服。`,
    bodyEn: `Your refund request for order ${refund.order.orderNumber} was rejected${
      input.adminNote ? ` (reason: ${input.adminNote})` : ""
    }. Please contact support if you have questions.`,
    link: `/orders/${refund.order.orderNumber}`,
    meta: {
      orderNumber: refund.order.orderNumber,
      refundId: refund.id,
      amount: Number(refund.amount),
      status: "REJECTED",
    },
  });
  return json({ refund: serializeRefund(updated) });
});
