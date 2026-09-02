import { apiHandler, json, searchParam } from "@/lib/api";
import { badRequest, rateLimited } from "@/lib/errors";
import { findUsableCoupon } from "@/server/services/order.service";
import { serializeCoupon } from "@/server/serializers";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/server/utils-server";

export const runtime = "nodejs";

/** GET /api/coupons/validate?code=xxx */
export const GET = apiHandler(async (req) => {
  const code = searchParam(new URL(req.url).searchParams, "code");
  if (!code) throw badRequest("请提供Discount码");

  // 防券码枚举：按 IP + 券码限流
  const rl = await rateLimit({
    key: `coupon-validate:${getClientIp(req)}:${code.toUpperCase()}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!rl.ok) throw rateLimited("查询过于频繁，请稍后再试");

  const coupon = await findUsableCoupon(code, "");
  return json({ coupon: serializeCoupon(coupon) });
});
