/**
 * 多币种显示模块(shop.x.com 式货币选择功能)
 * - 基础货币为 USD(与官方商店一致，系统内金额单位为美元)
 * - 汇率优先来自公开 API，离线时回退到内置参考汇率
 */

export interface CurrencyDef {
  code: string;
  name: string;
  country: string;
  symbol: string;
  locale: string;
  flag: string;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: "USD", name: "US Dollar", country: "United States", symbol: "$", locale: "en-US", flag: "🇺🇸" },
  { code: "CNY", name: "Chinese Yuan", country: "China", symbol: "¥", locale: "zh-CN", flag: "🇨🇳" },
  { code: "EUR", name: "Euro", country: "Eurozone", symbol: "€", locale: "de-DE", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", country: "United Kingdom", symbol: "£", locale: "en-GB", flag: "🇬🇧" },
  { code: "JPY", name: "Japanese Yen", country: "Japan", symbol: "¥", locale: "ja-JP", flag: "🇯🇵" },
  { code: "HKD", name: "Hong Kong Dollar", country: "Hong Kong", symbol: "HK$", locale: "zh-HK", flag: "🇭🇰" },
  { code: "SGD", name: "Singapore Dollar", country: "新加坡", symbol: "S$", locale: "en-SG", flag: "🇸🇬" },
  { code: "AUD", name: "Australian Dollar", country: "Australia", symbol: "A$", locale: "en-AU", flag: "🇦🇺" },
  { code: "CAD", name: "Canadian Dollar", country: "加拿大", symbol: "C$", locale: "en-CA", flag: "🇨🇦" },
];

/** 面向欧美客户：默认展示美元（用户可随时切换） */
export const DEFAULT_CURRENCY = "USD";
export const CURRENCY_COOKIE = "currency";

/** 内置参考汇率(1 USD 兑其他货币；离线兜底，联网后会被 API 覆盖) */
export const FALLBACK_RATES: Record<string, number> = {
  CNY: 7.16,
  USD: 1,
  EUR: 0.866,
  GBP: 0.74,
  JPY: 151.5,
  HKD: 7.79,
  SGD: 1.28,
  AUD: 1.42,
  CAD: 1.39,
};

export function getCurrencyDef(code: string | undefined | null): CurrencyDef {
  return CURRENCIES.find((c) => c.code === code) ?? (CURRENCIES[0] as CurrencyDef);
}

export function parseCurrencyCode(raw: string | undefined | null): string {
  const code = raw?.trim().toUpperCase();
  return CURRENCIES.some((c) => c.code === code) ? (code as string) : DEFAULT_CURRENCY;
}

export function convertPrice(amountBase: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return amountBase;
  return amountBase * rate;
}

/** 用 Intl 输出币种金额；未知币种回退符号拼接 */
export function formatAmount(amount: number, code: string): string {
  const def = getCurrencyDef(code);
  try {
    return new Intl.NumberFormat(def.locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${def.symbol}${amount.toFixed(2)}`;
  }
}

/** 币种选择提示文案，如 China (CNY ¥) / United States (USD $) */
export function currencyLabel(code: string): string {
  const def = getCurrencyDef(code);
  return `${def.country} (${code} ${def.symbol})`;
}
