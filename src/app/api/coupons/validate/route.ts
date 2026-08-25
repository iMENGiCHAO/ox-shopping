import { apiHandler, json, searchParam } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { findUsableCoupon } from "@/server/services/order.service";
import { serializeCoupon } from "@/server/serializers";

export const runtime = "nodejs";

/** GET /api/coupons/validate?code=xxx */
export const GET = apiHandler(async (req) => {
  const code = searchParam(new URL(req.url).searchParams, "code");
  if (!code) throw badRequest("请提供Discount码");

  const coupon = await findUsableCoupon(code, "");
  return json({ coupon: serializeCoupon(coupon) });
});
