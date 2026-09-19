import { describe, expect, it } from "vitest";
import {
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
