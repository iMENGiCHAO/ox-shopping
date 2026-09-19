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
  {
    code: "USD",
    name: "US Dollar",
    country: "United States",
    symbol: "$",
    locale: "en-US",
    flag: "🇺🇸",
  },
  { code: "CNY", name: "Chinese Yuan", country: "China", symbol: "¥", locale: "zh-CN", flag: "🇨🇳" },
  { code: "EUR", name: "Euro", country: "Eurozone", symbol: "€", locale: "de-DE", flag: "🇪🇺" },
  {
    code: "GBP",
    name: "British Pound",
    country: "United Kingdom",
    symbol: "£",
    locale: "en-GB",
    flag: "🇬🇧",
  },
  { code: "JPY", name: "Japanese Yen", country: "Japan", symbol: "¥", locale: "ja-JP", flag: "🇯🇵" },
  {
    code: "HKD",
    name: "Hong Kong Dollar",
    country: "Hong Kong",
    symbol: "HK$",
    locale: "zh-HK",
    flag: "🇭🇰",
  },
  {
    code: "SGD",
    name: "Singapore Dollar",
    country: "Singapore",
    symbol: "S$",
    locale: "en-SG",
    flag: "🇸🇬",
  },
  {
    code: "AUD",
    name: "Australian Dollar",
    country: "Australia",
    symbol: "A$",
    locale: "en-AU",
    flag: "🇦🇺",
  },
  {
    code: "CAD",
    name: "Canadian Dollar",
    country: "Canada",
    symbol: "C$",
    locale: "en-CA",
    flag: "🇨🇦",
  },
];

/** 默认展示美元（与官方商店一致；系统内金额单位为美元，用户可随时切换） */
export const DEFAULT_CURRENCY = "USD";
export const CURRENCY_COOKIE = "currency";

/**
 * 内置参考汇率(1 USD 兑其他货币；最终兜底，正常不会用到)。
 * 优先级：实时接口 → 库内最后已知好汇率(site_settings: fx.rates) → 本表。
 * 数值为 2026-08-25 快照，仅在上游与库内均不可用的极端情况下短暂生效。
 */
export const FALLBACK_RATES: Record<string, number> = {
  CNY: 6.7387,
  USD: 1,
  EUR: 0.8572,
  GBP: 0.7335,
  JPY: 159.1254,
  HKD: 7.8374,
  SGD: 1.2703,
  AUD: 1.3976,
  CAD: 1.3838,
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

/** 用 Intl 输出币种金额；未知币种回退符号拼接；欧元对齐 shop.x.com 格式 €58,95 */
export function formatAmount(amount: number, code: string): string {
  const def = getCurrencyDef(code);
  // shop.x.com 欧元格式：符号在前 + 逗号小数（€58,95）
  if (code === "EUR") {
    return `€${amount.toFixed(2).replace(".", ",")}`;
  }
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
