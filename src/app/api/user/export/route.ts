import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/user/export — 用户自助数据导出（GDPR Article 15 / 个人信息保护法）。
 *
 * 覆盖账号资料、地址、购物车、订单/退款、通知、到货订阅、密码找回记录、会话元数据
 * 与账号活动。明确排除密码哈希、refresh token 哈希、预签名 URL、支付网关凭证和管理员备注。
 */
export const GET = apiHandler(async (req) => {
  // 限流（安全审计）：全量 PII 导出，单用户 3 次/小时
  const actor = await requireUser();
  const rl = await rateLimit({ key: `user-export:${actor.id}`, ...RATE_LIMITS.userExport });
  if (!rl.ok) throw rateLimited();
  const user = actor;
  const userId = user.id;

  const [
    profile,
    addresses,
    cartItems,
    orders,
    refunds,
    notifications,
    notifySubscriptions,
    passwordResetRequests,
    sessions,
    activity,
    commissions,
    withdrawals,
    distributorAccount,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        role: true,
        status: true,
        emailVerified: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        passwordChangedAt: true,
        referralCode: true,
        isDistributor: true,
        firstPromoteAt: true,
      },
    }),
    prisma.address.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.cartItem.findMany({
      where: { userId },
      select: {
        id: true,
        productId: true,
        quantity: true,
        attributes: true,
        attributesKey: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        subtotal: true,
        shippingFee: true,
        tax: true,
        discount: true,
        total: true,
        currency: true,
        exchangeRate: true,
        addressSnapshot: true,
        paymentProvider: true,
        note: true,
        paidAt: true,
        shippedAt: true,
        deliveredAt: true,
        cancelledAt: true,
        refundedAt: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            productName: true,
            sku: true,
            quantity: true,
            price: true,
            subtotal: true,
            attributes: true,
          },
        },
      },
    }),
    prisma.refund.findMany({
      where: { userId },
      select: {
        id: true,
        orderId: true,
        reason: true,
        amount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        title: true,
        titleEn: true,
        body: true,
        bodyEn: true,
        link: true,
        meta: true,
        isUnread: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notifyMe.findMany({ where: { email: user.email }, orderBy: { createdAt: "desc" } }),
    prisma.passwordResetRequest.findMany({
      where: { userId },
      select: {
        id: true,
        email: true,
        status: true,
        note: true,
        handledAt: true,
        rejectReason: true,
        ip: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.refreshToken.findMany({
      where: { userId },
      select: { id: true, createdAt: true, expiresAt: true, revokedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { userId },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commissionLog.findMany({
      where: { toUserId: userId },
      select: {
        id: true,
        orderId: true,
        level: true,
        ratio: true,
        amount: true,
        amountCny: true,
        currency: true,
        baseAmount: true,
        status: true,
        reversedAmount: true,
        reversedCny: true,
        createdAt: true,
        settledAt: true,
        reversedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.withdrawRecord.findMany({
      where: { userId },
      select: {
        id: true,
        amount: true,
        status: true,
        payeeMethod: true,
        accountInfo: true,
        remark: true,
        createdAt: true,
        auditedAt: true,
        paidAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.distributorAccount.findUnique({ where: { userId } }),
  ]);

  await audit({
    userId,
    action: "USER_DATA_EXPORT",
    entity: "User",
    entityId: userId,
    req,
  });

  return json({
    exportedAt: new Date().toISOString(),
    format: "json",
    profile,
    addresses,
    cartItems,
    orders,
    refunds,
    notifications,
    restockSubscriptions: notifySubscriptions.map((n) => ({
      productId: n.productId,
      attributes: n.attributes,
      status: n.status,
      notifiedAt: n.notifiedAt,
      lang: n.lang,
      createdAt: n.createdAt,
    })),
    passwordResetRequests,
    sessions,
    activity,
    commissions,
    withdrawals,
    distributorAccount,
    excludedSecurityFields: [
      "passwordHash",
      "refreshToken.tokenHash",
      "order.accessToken",
      "payment gateway identifiers",
      "internal administrator notes",
    ],
  });
});
