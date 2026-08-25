import { apiHandler, json } from "@/lib/api";
import { getExchangeRates } from "@/components/shop/currency-server";

export const runtime = "nodejs";

/** GET /api/currency/rates — 返回 1 CNY 兑各币种汇率 */
export const GET = apiHandler(async () => {
  const rates = await getExchangeRates();
  return json({ base: "USD", rates, updatedAt: Date.now() });
});
