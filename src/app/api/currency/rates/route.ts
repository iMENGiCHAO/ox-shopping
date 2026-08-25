import { apiHandler, json } from "@/lib/api";
import { getRateSnapshot } from "@/components/shop/currency-server";

export const runtime = "nodejs";

/** GET /api/currency/rates — 返回 1 USD 兑各币种汇率（含来源与更新时间） */
export const GET = apiHandler(async () => {
  const snap = await getRateSnapshot();
  return json({
    base: "USD",
    rates: snap.rates,
    updatedAt: snap.at,
    /** live=实时接口 / db=库内最后已知 / static=内置参考表 */
    source: snap.source,
  });
});
