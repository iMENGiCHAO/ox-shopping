import "server-only";
import { cookies } from "next/headers";
import {
  convertPrice,
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  FALLBACK_RATES,
  formatAmount,
  getCurrencyDef,
  parseCurrencyCode,
} from "@/components/shop/currency";

const RATE_API = "https://open.er-api.com/v6/latest/USD";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 汇率每日更新，6 小时缓存足够

interface RateCache {
  at: number;
  rates: Record<string, number>;
}

let cache: RateCache | null = null;

/** 获取 1 CNY 兑各币种汇率；API 失败时回退内置参考汇率 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rates;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(RATE_API, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
      if (data.result === "success" && data.rates) {
        cache = { at: Date.now(), rates: { ...FALLBACK_RATES, ...data.rates } };
        return cache.rates;
      }
    }
  } catch {
    // 网络失败走回退
  }
  cache = { at: Date.now(), rates: FALLBACK_RATES };
  return FALLBACK_RATES;
}

/** 服务端读取当前币种(来自 cookie) */
export function getCurrencyCode(): string {
  return parseCurrencyCode(cookies().get(CURRENCY_COOKIE)?.value);
}

/** 服务端格式化：CNY 金额 → 当前币种显示 */
export async function formatPrice(amountBase: number): Promise<string> {
  const code = getCurrencyCode();
  const rates = await getExchangeRates();
  const rate = rates[code] ?? 1;
  return formatAmount(convertPrice(amountBase, rate), code);
}

/** 服务端显示当前币种标签，如 China (CNY ¥) */
export async function currencyLabel(): Promise<string> {
  const code = getCurrencyCode();
  const def = getCurrencyDef(code);
  return `${def.country} (${code} ${def.symbol})`;
}

export { DEFAULT_CURRENCY };
