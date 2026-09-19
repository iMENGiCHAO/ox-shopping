import { apiHandler, json } from "@/lib/api";
import { listPublicCoupons } from "@/server/services/coupon.service";

/**
 * GET /api/coupons — 公开领券页数据。
 *
 * 只返回 `isPublic=true` 且在有效期内、未抢完的券；
 * 不含 usageLimit / usedCount / perUserLimit 等内部统计字段
 * （这些会泄露运营数据，且对用户无用）。
 */
export const GET = apiHandler(async () => {
  const coupons = await listPublicCoupons();
  return json({ coupons });
});
