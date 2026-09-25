/**
 * 多币种显示模块(上游参考站 式货币选择功能)
 * - 基础货币为 USD(与官方商店一致，系统内金额单位为美元)
 * - 汇率优先来自公开 API，离线时回退到内置参考汇率
 */

export interface CurrencyDef {
  code: string;
  name: string;
  country: string;
  symbol: string;
  locale: string;
  /** ISO 3166-1 alpha-2（小写）—— 旗帜图片取 `public/flags/<flagCode>.svg`（4:3）。
   *  ⚠️ 不要改回 emoji：Windows 上的 Chrome/Firefox 不渲染国旗 emoji，会退化成 "US" 两个字母。 */
  flagCode: string;
}

export const CURRENCIES: CurrencyDef[] = [
  {
    code: "USD",
    name: "US Dollar",
    country: "United States",
    symbol: "$",
    locale: "en-US",
    flagCode: "us",
  },
  { code: "CNY", name: "Chinese Yuan", country: "China", symbol: "¥", locale: "zh-CN", flagCode: "cn" },
  { code: "EUR", name: "Euro", country: "Eurozone", symbol: "€", locale: "de-DE", flagCode: "eu" },
  {
    code: "GBP",
    name: "British Pound",
    country: "United Kingdom",
    symbol: "£",
    locale: "en-GB",
    flagCode: "gb",
  },
  { code: "JPY", name: "Japanese Yen", country: "Japan", symbol: "¥", locale: "ja-JP", flagCode: "jp" },
  {
    code: "HKD",
    name: "Hong Kong Dollar",
    country: "Hong Kong",
    symbol: "HK$",
    locale: "zh-HK",
    flagCode: "hk",
  },
  {
    code: "SGD",
    name: "Singapore Dollar",
    country: "Singapore",
    symbol: "S$",
    locale: "en-SG",
    flagCode: "sg",
  },
  {
    code: "AUD",
    name: "Australian Dollar",
    country: "Australia",
    symbol: "A$",
    locale: "en-AU",
    flagCode: "au",
  },
  {
    code: "CAD",
    name: "Canadian Dollar",
    country: "Canada",
    symbol: "C$",
    locale: "en-CA",
    flagCode: "ca",
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

/** USD 基础金额的分量（全部 USD 单位） */
export interface BaseAmountParts {
  subtotal: number;
  shipping: number;
  tax?: number;
  discount?: number;
}

/** 用户币种金额的分量（全部用户币种单位；整数分运算，无浮点漂移） */
export interface UserAmountParts {
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
}

/**
 * 多币种分摊：把 USD 基础金额按汇率换算为用户币种，并**严格保证恒等式**
 *   total = subtotal + shipping + tax − discount
 *
 * 为什么不能各自 `round(v * rate)`：每个分量独立舍入会累积 ±0.5 分的误差，
 * 4 个分量相乘后明细之和与总额可出现 1–2 分的缺口 —— 订单页/发票/退款/对账
 * 分别按「分量」和「总额」计算时对不上账（商业交付缺陷 A4）。
 *
 * 策略：
 * 1. 总额 = 真实总额按汇率舍入（顾客实付金额最准）；
 * 2. 残差（通常 1 分，极端 2–3 分）按「绝对值从大到小」每步 1 分分摊回分量，
 *    序号分量的相对失真最小；
 * 3. 全程整数分运算，避免浮点误差。
 *
 * 服务端落库（order.service）与前端展示（结账页/订单页）必须共用本函数，
 * 否则会出现「页面显示 90.58、实际扣款 90.59」。
 */
export function allocateRateAmounts(base: BaseAmountParts, rate: number): UserAmountParts {
  const r = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const shipping = base.shipping ?? 0;
  const tax = base.tax ?? 0;
  const discount = base.discount ?? 0;
  // sign：该分量在恒等式中的符号（discount 为减项）
  const parts: { sign: number; cents: number }[] = [
    { sign: 1, cents: Math.round(base.subtotal * r * 100) },
    { sign: 1, cents: Math.round(shipping * r * 100) },
    { sign: 1, cents: Math.round(tax * r * 100) },
    { sign: -1, cents: Math.round(discount * r * 100) },
  ];
  const totalCents = Math.round((base.subtotal + shipping + tax - discount) * r * 100);
  let residual = totalCents - parts.reduce((acc, p) => acc + p.sign * p.cents, 0);
  if (residual !== 0) {
    const order = [...parts].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
    for (let i = 0; residual !== 0 && i < 40; i++) {
      const p = order[i % order.length]!;
      const step = residual > 0 ? 1 : -1;
      // 调整分量的 cents：贡献变化 = sign * Δcents == step
      p.cents += step * p.sign;
      residual -= step;
    }
  }
  return {
    subtotal: parts[0]!.cents / 100,
    shipping: parts[1]!.cents / 100,
    tax: parts[2]!.cents / 100,
    discount: parts[3]!.cents / 100,
    total: totalCents / 100,
  };
}

/**
 * 行小计对齐：各行「USD 金额」按汇率换算为整数分，并保证
 *   Σ 行小计 = 目标小计（传订单级 subtotal，用户币种单位）
 *
 * 订单详情页列出每行小计再给出一行「Subtotal」——若各行独立舍入，
 * 求和会与小计行差 1–2 分。残差同样按行金额从大到小每步 1 分分摊。
 * 返回各行小计（用户币种单位，已舍入为 2 位小数）。
 */
export function allocateLineAmounts(
  rawUsdLines: number[],
  subtotalUser: number,
  rate: number,
): number[] {
  const r = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const cents = rawUsdLines.map((v) => Math.round(v * r * 100));
  const targetCents = Math.round(subtotalUser * 100);
  let residual = targetCents - cents.reduce((a, b) => a + b, 0);
  if (residual !== 0 && cents.length > 0) {
    const order = cents.map((_, i) => i).sort((a, b) => rawUsdLines[b]! - rawUsdLines[a]!);
    for (let i = 0; residual !== 0 && i < order.length * 4; i++) {
      const idx = order[i % order.length]!;
      const step = residual > 0 ? 1 : -1;
      // 防呆：减法不把 0 分小计压成负数（金额不可能为负）
      if (step < 0 && cents[idx]! <= 0) continue;
      cents[idx] = cents[idx]! + step;
      residual -= step;
    }
  }
  return cents.map((c) => c / 100);
}

/** 用 Intl 输出币种金额；未知币种回退符号拼接；欧元对齐 上游参考站 格式 €58,95 */
export function formatAmount(amount: number, code: string): string {
  const def = getCurrencyDef(code);
  // 上游参考站 欧元格式：符号在前 + 逗号小数（€58,95）
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
