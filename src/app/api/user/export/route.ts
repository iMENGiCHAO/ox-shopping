import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/user/export — 用户自助数据导出(GDPR Article 15 / 个人信息保护法)。
 * 返回本账号全部可携带数据的 JSON 快照；不包含密码哈希等凭证字段。
 */
export const GET = apiHandler(async (req) => {
  const user = await requireUser();

  const [profile, addresses, orders, reviews, favorites, notifySubscriptions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        email: true,
        name: true,
        role: true,
        createdAt: true,
        emailVerified: true,
      },
    }),
    prisma.address.findMany({ where: { userId: user.id } }),
    prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { items: { select: { productName: true, quantity: true, price: true, attributes: true } } },
    }),
    prisma.review.findMany({ where: { userId: user.id } }),
    prisma.favorite.findMany({ where: { userId: user.id } }),
    prisma.notifyMe.findMany({ where: { email: user.email } }),
  ]);

  await audit({
    userId: user.id,
    action: "USER_DATA_EXPORT",
    entity: "User",
    entityId: user.id,
    req,
  });

  return json({
    exportedAt: new Date().toISOString(),
    format: "json",
    profile,
    addresses,
    orders,
    reviews,
    favorites,
    restockSubscriptions: notifySubscriptions.map((n) => ({
      productId: n.productId,
      attributes: n.attributes,
      status: n.status,
      createdAt: n.createdAt,
    })),
  });
});
