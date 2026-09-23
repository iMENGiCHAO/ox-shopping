import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * 账户注销的最小化匿名化事务。
 *
 * 不物理删除 User/Order：财务、佣金和审计需要保留可证明的链路；但姓名、邮箱、
 * 地址快照、联系邮箱、备注等直接标识必须清除。refresh token 记录一并删除。
 */
export async function anonymizeAccountData(userId: string, originalEmail: string): Promise<void> {
  const anonymousEmail = `deleted-${userId}@invalid.local`;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        email: anonymousEmail,
        name: "已注销用户",
        status: "DISABLED",
        emailVerified: false,
        deletionRequestedAt: null,
        passwordChangedAt: null,
        // 保留不可登录的占位哈希，避免任何旧凭证意外命中；真实 bcrypt 哈希随注销清除。
        passwordHash: "!",
        referralCode: null,
        invitedById: null,
        distPath: null,
        isDistributor: false,
        firstPromoteAt: null,
      },
    }),
    prisma.address.deleteMany({ where: { userId } }),
    prisma.cartItem.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({
      where: { meta: { path: ["userId"], equals: userId } },
    }),
    prisma.passwordResetRequest.updateMany({
      where: { userId },
      data: { email: anonymousEmail, note: null, ip: null, rejectReason: null },
    }),
    prisma.notifyMe.updateMany({
      where: { email: originalEmail },
      data: { email: anonymousEmail },
    }),
    prisma.couponRedemption.updateMany({
      where: { userId },
      data: { email: null },
    }),
    prisma.order.updateMany({
      where: { userId },
      data: {
        contactEmail: null,
        addressSnapshot: { anonymized: true },
        note: null,
        adminNote: null,
      },
    }),
    prisma.refund.updateMany({
      where: { userId },
      data: { reason: "Account deletion", adminNote: null },
    }),
    prisma.commissionLog.updateMany({
      where: { toUserId: userId },
      data: { toUserName: "已注销用户", toUserEmail: anonymousEmail, note: null },
    }),
    prisma.commissionLog.updateMany({
      where: { fromUserId: userId },
      data: { note: null },
    }),
    prisma.withdrawRecord.updateMany({
      where: { userId },
      data: { userEmail: anonymousEmail, accountInfo: null, remark: null },
    }),
    prisma.rebindRequest.updateMany({
      where: {
        OR: [{ customerId: userId }, { toDistributorId: userId }, { fromDistributorId: userId }],
      },
      data: { reviewNote: null },
    }),
    prisma.auditLog.updateMany({
      where: { userId },
      data: { meta: { redacted: true }, ip: null, userAgent: null },
    }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ]);
}
