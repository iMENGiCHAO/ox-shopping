import { apiHandler, json, readJson } from "@/lib/api";
import { computeCouponDiscount, findUsableCoupon } from "@/server/services/order.service";
import { serializeCoupon } from "@/server/serializers";
import { couponApplySchema } from "@/lib/validations/cart-order";
import { SHIPPING_FEE } from "@/lib/constants";

export const runtime = "nodejs";

/** POST /api/coupons/apply — 计算Discount券折扣 */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, couponApplySchema);

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
