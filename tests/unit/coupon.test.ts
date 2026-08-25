import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { computeCouponDiscount } from "@/server/services/order.service";

describe("优惠券折扣计算", () => {
  it("百分比折扣", () => {
    const r = computeCouponDiscount(
      { type: "PERCENTAGE", value: 10, minSpend: 100, maxDiscount: null },
      500,
      10,
    );
    expect(r).toEqual({ discount: 50, freeShipping: false });
  });

  it("百分比折扣受最高减免限制", () => {
    const r = computeCouponDiscount(
      { type: "PERCENTAGE", value: 10, minSpend: 100, maxDiscount: new Prisma.Decimal(200) },
      5000,
      10,
    );
    expect(r.discount).toBe(200);
  });

  it("固定金额", () => {
    const r = computeCouponDiscount(
      { type: "FIXED", value: 50, minSpend: 300, maxDiscount: null },
      400,
      10,
    );
    expect(r).toEqual({ discount: 50, freeShipping: false });
  });

  it("低于门槛报错", () => {
    expect(() =>
      computeCouponDiscount(
        { type: "FIXED", value: 50, minSpend: 300, maxDiscount: null },
        200,
        10,
      ),
    ).toThrow("满 300 元");
  });

  it("免运费券", () => {
    const r = computeCouponDiscount(
      { type: "FREE_SHIPPING", value: 0, minSpend: 99, maxDiscount: null },
      150,
      10,
    );
    expect(r).toEqual({ discount: 0, freeShipping: true });
  });

  it("折扣不超过商品小计", () => {
    const r = computeCouponDiscount(
      { type: "FIXED", value: 100, minSpend: 0, maxDiscount: null },
      30,
      10,
    );
    expect(r.discount).toBe(30);
  });
});
