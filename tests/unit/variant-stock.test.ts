import { describe, expect, it } from "vitest";
import {
  availableValuesFor,
  findVariant,
  isVariantSoldOut,
  parseVariantAttributes,
  planVariantDeduction,
  selectableGroupsFromVariants,
  totalVariantStock,
  variantPriceRange,
  variantSignature,
  type VariantLike,
} from "@/server/services/variant-stock";

/**
 * SKU 矩阵（ProductVariant）单元回归 —— 覆盖大爷场景：
 * 「不同颜色有不同尺码范围」（红只有 S/M，蓝才有 L）与组合粒度库存。
 */

const v = (
  id: string,
  attrs: Record<string, string>,
  stock: number,
  extra: Partial<VariantLike> = {},
): VariantLike => ({
  id,
  attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
  stock,
  isActive: true,
  ...extra,
});

describe("variantSignature：规范化组合键", () => {
  it("属性顺序不影响签名（颜色在前/尺码在前同键）", () => {
    const a = variantSignature([
      { name: "颜色", value: "红" },
      { name: "尺码", value: "M" },
    ]);
    const b = variantSignature([
      { name: "尺码", value: "M" },
      { name: "颜色", value: "红" },
    ]);
    expect(a).toBe(b);
    expect(a).toBe("尺码:M|颜色:红");
  });

  it("空属性返回空串（不误匹配）", () => {
    expect(variantSignature([])).toBe("");
    expect(variantSignature([{ name: "", value: "x" }])).toBe("");
  });
});

describe("parseVariantAttributes：宽松解析", () => {
  it("非法结构返回空数组", () => {
    expect(parseVariantAttributes(null)).toEqual([]);
    expect(parseVariantAttributes({ a: 1 })).toEqual([]);
    expect(parseVariantAttributes([{ name: "颜色" }, { value: "红" }])).toEqual([]);
  });
  it("过滤空名/空值，保留合法项", () => {
    expect(
      parseVariantAttributes([
        { name: "颜色", value: "红" },
        { name: "", value: "x" },
        { name: "尺码", value: "" },
      ]),
    ).toEqual([{ name: "颜色", value: "红" }]);
  });
});

describe("大爷场景：不同颜色有不同尺码范围", () => {
  // 红：S/M；蓝：M/L —— 蓝色才有 L，红色没有 L
  const variants = [
    v("r-s", { 颜色: "红", 尺码: "S" }, 2),
    v("r-m", { 颜色: "红", 尺码: "M" }, 3),
    v("b-m", { 颜色: "蓝", 尺码: "M" }, 5),
    v("b-l", { 颜色: "蓝", 尺码: "L" }, 4),
  ];

  it("可选组由真实组合推导（不出现不存在的组合）", () => {
    const groups = selectableGroupsFromVariants(variants);
    expect(groups).toEqual([
      { name: "颜色", values: ["红", "蓝"] },
      { name: "尺码", values: ["S", "M", "L"] },
    ]);
  });

  it("选「红」后，尺码只保留 S/M —— L 不再出现（核心诉求）", () => {
    expect(availableValuesFor(variants, "尺码", [{ name: "颜色", value: "红" }])).toEqual(["S", "M"]);
  });

  it("选「蓝」后，尺码是 M/L", () => {
    expect(availableValuesFor(variants, "尺码", [{ name: "颜色", value: "蓝" }])).toEqual(["M", "L"]);
  });

  it("未选颜色时，尺码是全部并集", () => {
    expect(availableValuesFor(variants, "尺码")).toEqual(["S", "M", "L"]);
  });

  it("findVariant 按组合定位；不存在的组合（红+L）返回 null → 前台不可选", () => {
    expect(findVariant(variants, { 颜色: "红", 尺码: "M" })?.id).toBe("r-m");
    expect(findVariant(variants, { 颜色: "红", 尺码: "L" })).toBeNull();
  });

  it("下架的组合不参与可选值", () => {
    const withInactive = [...variants.slice(0, 3), { ...variants[3]!, isActive: false }];
    expect(availableValuesFor(withInactive, "尺码", [{ name: "颜色", value: "蓝" }])).toEqual(["M"]);
  });
});

describe("planVariantDeduction：组合粒度扣减", () => {
  it("库存充足 → 扣请求量", () => {
    const p = planVariantDeduction(v("x", { 颜色: "红" }, 5), 2);
    expect(p).toMatchObject({ ok: true, deducted: 2, nextStock: 3 });
  });

  it("库存不足（普通商品）→ 拒绝，报可用量", () => {
    const p = planVariantDeduction(v("x", { 颜色: "红" }, 1), 3);
    expect(p).toMatchObject({ ok: false, reason: "INSUFFICIENT", available: 1, deducted: 0 });
  });

  it("库存为 0 → SOLD_OUT；组合不存在 → NOT_FOUND", () => {
    expect(planVariantDeduction(v("x", { 颜色: "红" }, 0), 1)).toMatchObject({
      ok: false,
      reason: "SOLD_OUT",
    });
    expect(planVariantDeduction(null, 1)).toMatchObject({ ok: false, reason: "NOT_FOUND" });
  });

  it("预售（allowShortfall）→ 扣可用量、不阻断", () => {
    expect(planVariantDeduction(v("x", { 颜色: "红" }, 1), 3, true)).toMatchObject({
      ok: true,
      deducted: 1,
      nextStock: 0,
    });
    expect(planVariantDeduction(v("x", { 颜色: "红" }, 0), 2, true)).toMatchObject({
      ok: true,
      deducted: 0,
    });
  });
});

describe("聚合口径", () => {
  const variants = [v("a", { 颜色: "红" }, 2), v("b", { 颜色: "蓝" }, 3), v("c", { 颜色: "黑" }, 1, { isActive: false })];

  it("总可售量 = Σ active 库存（下架不计）", () => {
    expect(totalVariantStock(variants)).toBe(5);
  });

  it("售罄判定", () => {
    expect(isVariantSoldOut(v("x", { 颜色: "红" }, 0))).toBe(true);
    expect(isVariantSoldOut(v("x", { 颜色: "红" }, 1))).toBe(false);
    expect(isVariantSoldOut(null)).toBe(true);
  });

  it("价格区间取组合覆盖价（大码加价）", () => {
    const priced = [
      v("a", { 尺码: "M" }, 1, { price: 100 }),
      v("b", { 尺码: "L" }, 1, { price: 120 }),
    ];
    expect(variantPriceRange(priced, 99)).toEqual({ min: 100, max: 120 });
    expect(variantPriceRange([v("a", { 尺码: "M" }, 1)], 99)).toEqual({ min: 99, max: 99 });
  });
});
