import { apiHandler, json, readJson } from "@/lib/api";
import { rateLimited } from "@/lib/errors";
import { computeCouponDiscount, findUsableCoupon } from "@/server/services/order.service";
import { serializeCoupon } from "@/server/serializers";
import { couponApplySchema } from "@/lib/validations/cart-order";
import { SHIPPING_FEE } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/server/utils-server";

export const runtime = "nodejs";

/** POST /api/coupons/apply — 计算Discount券折扣 */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, couponApplySchema);

  const rl = await rateLimit({
    key: `coupon-apply:${getClientIp(req)}:${input.code.toUpperCase()}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rl.ok) throw rateLimited("操作过于频繁，请稍后再试");

  const coupon = await findUsableCoupon(input.code, "");
  const { discount, freeShipping } = computeCouponDiscount(
    {
      type: coupon.type,
      value: coupon.value,
      minSpend: Number(coupon.minSpend),
      maxDiscount: coupon.maxDiscount,
    },
    input.subtotal,
    SHIPPING_FEE,
  );

  return json({ coupon: serializeCoupon(coupon), discount, freeShipping });
});
