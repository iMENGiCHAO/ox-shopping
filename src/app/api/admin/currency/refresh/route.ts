import { apiHandler, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import { forceRefreshRates } from "@/components/shop/currency-server";

export const runtime = "nodejs";

/** POST /api/admin/currency/refresh — 立即拉取上游汇率并落库(绕过缓存)（仅 ADMIN） */
export const POST = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const snapshot = await forceRefreshRates();

  await audit({
    userId: actor.id,
    action: "CURRENCY_RATES_REFRESH",
    meta: { source: snapshot.source },
    req,
  });

  return json({ snapshot });
});
