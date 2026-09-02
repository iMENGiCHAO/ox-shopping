import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** GET /api/user/favorites — 当前用户收藏列表（含商品信息 + 关联降价通知状态） */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          nameEn: true,
          price: true,
          images: true,
          status: true,
        },
      },
      priceAlert: {
        select: {
          id: true,
          unsubscribed: true,
          notifiedAt: true,
          notifiedPrice: true,
        },
      },
    },
  });
  return json({ favorites });
});
