import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listActiveCoupons } from "@/server/services/product.service";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** GET /api/user/coupons — 我的Discount券：已领取 + 可领取 */
export const GET = apiHandler(async () => {
  const user = await requireUser();

  const [redeemed, available] = await Promise.all([
    prisma.couponRedemption.findMany({
      where: { userId: user.id },
      include: { coupon: true },
      orderBy: { createdAt: "desc" },
    }),
    listActiveCoupons(),
  ]);

  return json({ redeemed, available });
});
