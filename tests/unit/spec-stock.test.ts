import { describe, expect, it } from "vitest";
import {
  aggregateTrackedStock,
  applySpecRestock,
  parseSpecStock,
  planSpecDeduction,
} from "@/server/services/spec-stock";

describe("parseSpecStock", () => {
  it("解析合法映射", () => {
    expect(parseSpecStock({ Size: { S: 3, M: 0 } })).toEqual({ Size: { S: 3, M: 0 } });
  });
  it("非法结构返回空对象", () => {
    expect(parseSpecStock(null)).toEqual({});
    expect(parseSpecStock([1, 2])).toEqual({});
    expect(parseSpecStock({ Size: "abc" })).toEqual({});
    expect(parseSpecStock({ Size: { S: "3.7" } })).toEqual({ Size: { S: 3 } }); // 字符串数字取整
    expect(parseSpecStock({ Size: { S: -5 } })).toEqual({ Size: { S: 0 } }); // 负数钳到 0
  });
});

describe("planSpecDeduction(普通商品)", () => {
  const spec = { Color: { Black: 5, White: 0 }, Size: { M: 10 } };
  const attrs = [
    { name: "Color", value: "Black" },
    { name: "Size", value: "M" },
  ];

  it("库存充足：全额扣减并生成新映射", () => {
    const plan = planSpecDeduction(spec, attrs, 2);
    expect(plan.ok).toBe(true);
    expect(plan.deducted).toEqual({ "Color/Black": 2, "Size/M": 2 });
    expect(plan.next.Color!.Black).toBe(3);
    expect(plan.next.Size!.M).toBe(8);
    // 原对象不被修改(纯函数)
    expect(spec.Color.Black).toBe(5);
  });

  it("被追踪规格不足：整单失败并报出组/值/余量", () => {
    const plan = planSpecDeduction(spec, [{ name: "Color", value: "White" }], 1);
    expect(plan.ok).toBe(false);
    expect(plan.shortage).toEqual({ group: "Color", value: "White", available: 0 });
  });

  it("未追踪的组视为可用，不参与扣减", () => {
    const plan = planSpecDeduction(spec, [{ name: "Material", value: "Cotton" }], 99);
    expect(plan.ok).toBe(true);
    expect(plan.deducted).toEqual({});
  });

  it("无规格选择时不扣减", () => {
    const plan = planSpecDeduction(spec, undefined, 1);
    expect(plan.ok).toBe(true);
    expect(Object.keys(plan.deducted)).toHaveLength(0);
  });
});

describe("planSpecDeduction(预售 allowShortfall)", () => {
  const spec = { Color: { Black: 3 } };

  it("缺口允许：只扣实际可用部分，下限 0", () => {
    const plan = planSpecDeduction(spec, [{ name: "Color", value: "Black" }], 7, true);
    expect(plan.ok).toBe(true);
    expect(plan.deducted["Color/Black"]).toBe(3);
    expect(plan.next.Color!.Black).toBe(0);
  });

  it("可用为 0 的预售：扣减为 0 但不失败", () => {
    const zero = { Color: { Black: 0 } };
    const plan = planSpecDeduction(zero, [{ name: "Color", value: "Black" }], 2, true);
    expect(plan.ok).toBe(true);
    expect(plan.deducted["Color/Black"]).toBe(0);
  });
});

describe("applySpecRestock(取消回补)", () => {
  it("按记录精确回补", () => {
    const spec = { Color: { Black: 1 } };
    const next = applySpecRestock(spec, { "Color/Black": 4, "Size/M": 2 });
    expect(next!.Color!.Black).toBe(5); // 1 + 4
    expect(next!.Size!.M).toBe(2); // 未追踪组自动创建
  });

  it("空记录返回 null(无需落库)", () => {
    expect(applySpecRestock({}, null)).toBeNull();
    expect(applySpecRestock({}, {})).toBeNull();
    expect(applySpecRestock({}, { "Color/Black": 0 })).toBeNull();
  });

  it("畸形键安全跳过", () => {
    const next = applySpecRestock({ Color: { Black: 1 } }, { "BadKey": 5, "Color/Black": 1 });
    expect(next!.Color!.Black).toBe(2);
  });

  it("NaN 防护：DB 脏数据 / 旧版本漏入 NaN 不会污染整张表", () => {
    // 模拟上游 schema 漂移：specStock 里有 NaN 值
    const dirtySpec = { Color: { Black: NaN as unknown as number } };
    const next = applySpecRestock(dirtySpec, { "Color/Black": 3 });
    // 旧实现：NaN + 3 = NaN；新实现：0 + 3 = 3
    expect(Number.isNaN(next!.Color!.Black)).toBe(false);
    expect(next!.Color!.Black).toBe(3);
  });
});


describe("aggregateTrackedStock — 整件库存与规格库存一致性口径", () => {
  it("单组：总库存 = 该组之和", () => {
    expect(aggregateTrackedStock({ Size: { S: 3, M: 4 } })).toBe(7);
  });

  it("多组(Color×Size)：取各组之和的最小值，任一维度都是上限", () => {
    // Color Σ=8，Size Σ=12 → 可售上限由 Color 决定
    expect(aggregateTrackedStock({ Color: { 黑: 5, 白: 3 }, Size: { M: 10, L: 2 } })).toBe(8);
  });

  it("某组售罄(全 0) → 总库存为 0", () => {
    expect(aggregateTrackedStock({ Color: { 红: 0 }, Size: { M: 9 } })).toBe(0);
  });

  it("空映射/无追踪数据返回 null（表示未启用规格库存）", () => {
    expect(aggregateTrackedStock({})).toBeNull();
    expect(aggregateTrackedStock(null)).toBeNull();
    expect(aggregateTrackedStock({ Color: {} })).toBeNull();
  });
});
