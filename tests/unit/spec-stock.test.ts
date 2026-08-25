import { describe, expect, it } from "vitest";
import {
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
});
