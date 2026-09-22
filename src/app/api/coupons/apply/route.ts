import { apiHandler, json, readJson } from "@/lib/api";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { getSessionUser } from "@/lib/auth/session";
import { quoteOrderAmounts } from "@/server/services/order.service";
import { CouponRejectError } from "@/server/services/coupon.service";
import { couponReasonMessage } from "@/lib/coupon";
import { getT } from "@/lib/shop-i18n-server";
import { formatUsdInRequestCurrency } from "@/lib/server/money-server";
import { couponApplySchema } from "@/lib/validations/cart-order";
import { getClientIp } from "@/lib/server/utils-server";

export const runtime = "nodejs";

/**
 * POST /api/coupons/apply — 折扣码试算（**只读**，不落库、不核销）。
 *
 * 用途：结账页点「应用」时给出减免额与失败原因。
 * 真正的核销发生在 POST /api/orders 的下单事务里（对 coupons 行加锁后重新校验），
 * 因此这里通过不代表一定能用——但失败一定会在这里就被拦下，用户不会填完表单才被告知。
 *
 * 金额一律由服务端按 DB 现价重算（quoteOrderAmounts），不接受前端传金额。
 * 校验失败返回 200 + `{ ok: false, reason }`（业务态而非 HTTP 错误），
 * 便于前端把原因渲染成行内提示而不是弹错误框。
 */
export const POST = apiHandler(async (req) => {
  const user = await getSessionUser();
  const input = await readJson(req, couponApplySchema);

  // 试算是暴力枚举券码的天然入口（撞码），必须限流。
  // 登录用户按 userId，游客退到 IP/指纹维度；另加全站熔断 600 次/10 分钟防标识轮换撞码。
  const rlKey = user ? `coupon-apply:${user.id}` : `coupon-apply-ip:${getClientIp(req)}`;
  const rl = await rateLimit({
    key: rlKey,
    ...RATE_LIMITS.couponApply,
    breakerKey: user ? undefined : RATE_LIMITS.couponApply.breakerKey,
  });
  if (!rl.ok) throw rateLimited();

  try {
    const quote = await quoteOrderAmounts({
      items: input.items,
      // 与 /api/orders 同口径：schema 的 .default("standard") 只在解析期生效，
      // 这里的 ?? 是给「调用方省略该字段」时的显式兜底
      shippingMethod: input.shippingMethod ?? "standard",
      couponCode: input.code,
      userId: user?.id ?? null,
      // 登录单用账号邮箱（防伪造）；游客单用结账页填写的邮箱
      email: user ? user.email : (input.contactEmail ?? null),
    });
    return json({ ok: true, quote });
  } catch (err) {
    if (err instanceof CouponRejectError) {
      const t = await getT();
      const shortfall =
        err.reason === "MIN_SPEND" && err.shortfallUsd != null
          ? await formatUsdInRequestCurrency(err.shortfallUsd)
          : undefined;
      return json({
        ok: false,
        reason: err.reason,
        message: couponReasonMessage(err.reason, t, shortfall),
        /** 差额（基础币种 USD），前端若想自行按当前币种渲染可用 */
        shortfallUsd: err.shortfallUsd ?? null,
      });
    }
    throw err;
  }
});
