import { apiHandler, json } from "@/lib/api";
import { audit } from "@/lib/audit";
import { forceRefreshRates } from "@/components/shop/currency-server";

export const runtime = "nodejs";

/** POST /api/admin/currency/refresh — 立即拉取上游汇率并落库(绕过缓存) */
export const POST = apiHandler(async (req) => {
  const snapshot = await forceRefreshRates();

  await audit({
    action: "CURRENCY_RATES_REFRESH",
    meta: { source: snapshot.source },
    req,
  });

  return json({ snapshot });
});
