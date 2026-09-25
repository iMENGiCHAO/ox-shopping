import { apiHandler, json } from "@/lib/api";
import { listEnabledCurrencies } from "@/server/services/currency-config.service";

export const runtime = "nodejs";

/**
 * GET /api/currency/list — 前台币种选择器数据源（enabled 列表，含国旗/符号/排序）。
 * 后台「货币与汇率」增删币种或开关 enabled 后，前台选择器即时跟随（无缓存依赖）。
 */
export const GET = apiHandler(async () => {
  const currencies = await listEnabledCurrencies();
  return json(
    { currencies },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=300" } },
  );
});
