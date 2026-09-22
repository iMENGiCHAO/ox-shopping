import { describe, expect, it } from "vitest";
import {
  allocateLineAmounts,
  allocateRateAmounts,
  CURRENCIES,
  convertPrice,
  currencyLabel,
  DEFAULT_CURRENCY,
  FALLBACK_RATES,
  formatAmount,
  getCurrencyDef,
  parseCurrencyCode,
} from "@/components/shop/currency";

describe("货币换算（多币种功能）", () => {
  it("前台默认展示美元（与官方商店一致），内置汇率覆盖全部支持币种", () => {
    expect(DEFAULT_CURRENCY).toBe("USD");
    for (const c of CURRENCIES) {
      expect(FALLBACK_RATES[c.code]).toBeGreaterThan(0);
    }
    expect(FALLBACK_RATES.USD).toBe(1);
  });

  it("convertPrice 按汇率换算，非法汇率回退原值", () => {
    expect(convertPrice(100, 7.16)).toBeCloseTo(716, 2);
    expect(convertPrice(100, 0)).toBe(100);
    expect(convertPrice(100, Number.NaN)).toBe(100);
  });

  it("formatAmount 输出对应币种格式", () => {
    expect(formatAmount(14.79, "USD")).toBe("$14.79");
    expect(formatAmount(100, "CNY")).toBe("¥100.00");
    expect(formatAmount(23.57, "JPY")).toMatch(/[¥￥]/);
  });

  it("parseCurrencyCode 未知币种回退默认币种", () => {
    expect(parseCurrencyCode("usd")).toBe("USD");
    expect(parseCurrencyCode("BTC")).toBe(DEFAULT_CURRENCY);
    expect(parseCurrencyCode(undefined)).toBe(DEFAULT_CURRENCY);
    expect(parseCurrencyCode("")).toBe(DEFAULT_CURRENCY);
  });

  it("getCurrencyDef 返回正确定义并兜底", () => {
    expect(getCurrencyDef("USD").symbol).toBe("$");
    expect(getCurrencyDef("NOPE").code).toBe("USD");
  });

  it("currencyLabel 生成 国家 (CODE 符号) 文案（前台英文）", () => {
    expect(currencyLabel("USD")).toBe("United States (USD $)");
    expect(currencyLabel("CNY")).toBe("China (CNY ¥)");
  });
});

/**
 * 多币种分账恒等式（商业交付缺陷 A4）。
 *
 * 病因：各分量独立 `round(v * rate)` 会累积 ±0.5 分误差，
 * 明细之和与总额出现 1–2 分缺口（发票/退款/对账按分量与总额分别计算时对不上）。
 * 方案：total 按真实总额舍入，残差按绝对值从大到小 1 分分摊回分量。
 */
describe("多币种分账恒等式 allocateRateAmounts", () => {
  const identityHolds = (r: {
    subtotal: number;
    shipping: number;
    tax: number;
    discount: number;
    total: number;
  }) =>
    Math.round((r.subtotal + r.shipping + r.tax - r.discount) * 100) ===
    Math.round(r.total * 100);

  it("复现原始缺陷案例：rate=7.246891 时明细之和必须等于总额", () => {
    const rate = 7.246891;
    // 旧实现：72.47 + 36.23 − 18.12 = 90.58，而 total = 90.59（差 1 分）
    const r = allocateRateAmounts({ subtotal: 10, shipping: 5, discount: 2.5 }, rate);
    expect(r.total).toBe(90.59);
    expect(identityHolds(r)).toBe(true);
    expect(Math.round((r.subtotal + r.shipping - r.discount) * 100)).toBe(9059);
  });

  it("总额取真实总额舍入（顾客实付最准），残差只改分量", () => {
    const rate = 7.246891;
    const r = allocateRateAmounts({ subtotal: 10, shipping: 5, discount: 2.5 }, rate);
    expect(r.total).toBe(Math.round(12.5 * rate * 100) / 100);
    // 分量失真上限 = 舍入 0.005 + 残差分摊 0.01 = 0.015（残差落在最大分量 subtotal 上）
    expect(Math.abs(r.subtotal - 10 * rate)).toBeLessThanOrEqual(0.015);
    expect(Math.abs(r.shipping - 5 * rate)).toBeLessThanOrEqual(0.015);
  });

  it("全部内置币种 × 多组金额：恒等式恒成立", () => {
    const cases = [
      { subtotal: 10, shipping: 5, discount: 2.5 },
      { subtotal: 0.01, shipping: 0, discount: 0 },
      { subtotal: 19.99, shipping: 9.99, discount: 0 },
      { subtotal: 100, shipping: 0, discount: 100 },
      { subtotal: 123.45, shipping: 12.34, discount: 5.67 },
      { subtotal: 3.33, shipping: 1.11, discount: 0.99 },
    ];
    for (const c of CURRENCIES) {
      const rate = FALLBACK_RATES[c.code] ?? 1;
      for (const cs of cases) {
        const r = allocateRateAmounts(cs, rate);
        expect(identityHolds(r), `${c.code} ${JSON.stringify(cs)}`).toBe(true);
      }
    }
  });

  it("伪随机 fuzz：任意汇率/金额组合恒等式不破", () => {
    // 线性同余伪随机（固定种子，可复现），避免引入额外依赖
    let seed = 20260921;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 500; i++) {
      const rate = 0.5 + next() * 12;
      const subtotal = Math.round(next() * 200000) / 100;
      const shipping = Math.round(next() * 3000) / 100;
      const discount = Math.round(next() * Math.min(subtotal + shipping, 5000)) / 100;
      const r = allocateRateAmounts({ subtotal, shipping, discount }, rate);
      expect(identityHolds(r), `rate=${rate} base=${subtotal}/${shipping}/${discount}`).toBe(true);
    }
  });

  it("非法/零汇率按 1 处理，不产生 NaN", () => {
    for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = allocateRateAmounts({ subtotal: 10, shipping: 5, discount: 2.5 }, rate);
      expect(Number.isFinite(r.total)).toBe(true);
      expect(identityHolds(r)).toBe(true);
    }
  });

  it("税分量参与恒等式（未来启用 TAX_RATE 时依然成立）", () => {
    const r = allocateRateAmounts({ subtotal: 33.33, shipping: 4.44, tax: 8.88, discount: 1.11 }, 7.13);
    expect(identityHolds(r)).toBe(true);
    expect(r.tax).toBeGreaterThan(0);
  });
});

describe("行小计对齐 allocateLineAmounts", () => {
  const sum = (a: number[]) => Math.round(a.reduce((s, v) => s + v, 0) * 100) / 100;

  it("各行独立舍入会差 1 分，对齐后 Σ 行小计 == 订单小计", () => {
    // 两行各 3.335 USD，rate=1：独立舍入 3.34+3.34=6.68，而小计 = round(6.67) = 6.67
    const lines = allocateLineAmounts([3.335, 3.335], 6.67, 1);
    expect(sum(lines)).toBe(6.67);
    expect(lines).toHaveLength(2);
  });

  it("汇率下的行小计求和等于小计（顺序无关）", () => {
    const rate = 7.246891;
    const raw = [12.5, 3.335, 0.01];
    const subtotalUser = Math.round(raw.reduce((s, v) => s + v, 0) * rate * 100) / 100;
    const lines = allocateLineAmounts(raw, subtotalUser, rate);
    expect(sum(lines)).toBe(subtotalUser);
    expect(lines.every((v) => v >= 0)).toBe(true);
  });

  it("大额行优先承担残差（相对失真最小）", () => {
    const lines = allocateLineAmounts([0.005, 99.995], 100, 1);
    expect(sum(lines)).toBe(100);
    // 大额行允许 ±1 分，小额行不被压成负数
    expect(lines[0]!).toBeGreaterThanOrEqual(0);
  });

  it("空行数组不炸（防御性）", () => {
    expect(allocateLineAmounts([], 0, 7)).toEqual([]);
  });
});
