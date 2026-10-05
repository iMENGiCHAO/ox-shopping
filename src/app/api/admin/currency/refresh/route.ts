import { apiHandler, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { forceRefreshRates } from "@/components/shop/currency-server";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

export const runtime = "nodejs";

/** POST /api/admin/currency/refresh — 立即拉取上游汇率并落库(绕过缓存)（仅 ADMIN） */
export const POST = apiHandler(async (req) => {
  const actor = await requireAdmin();
  // 限流（安全审计）：上游是免费汇率接口，滥用会被限流/封禁
  const rl = await rateLimit({
    key: `admin-currency-refresh:${actor.id}`,
    ...RATE_LIMITS.adminCurrencyRefresh,
  });
  if (!rl.ok) throw rateLimited();
  const snapshot = await forceRefreshRates();

  await audit({
    userId: actor.id,
    action: "CURRENCY_RATES_REFRESH",
    meta: { source: snapshot.source },
    req,
  });

  return json({ snapshot });
});
