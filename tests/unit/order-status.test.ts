import { describe, expect, it } from "vitest";
import {
  ORDER_STATUS_LABELS,
  canTransition,
  assertTransition,
  REFUNDABLE_STATUSES,
  ORDER_STATUS_FLOW,
} from "@/lib/order-status";

describe("订单状态机", () => {
  it("正常主链路从已验证收款开始", () => {
    // PENDING_PAYMENT → PAID 只能由支付回调/对账的原子更新完成，
    // 不属于管理员通用状态机，否则可凭空制造收入。
    expect(canTransition("PENDING_PAYMENT", "PAID")).toBe(false);
    expect(canTransition("PAID", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true);
  });

  it("快捷路径（PAID 直接发货）", () => {
    expect(canTransition("PAID", "SHIPPED")).toBe(true);
  });

  it("取消与退款", () => {
    expect(canTransition("PENDING_PAYMENT", "CANCELLED")).toBe(true);
    expect(canTransition("PAID", "REFUNDED")).toBe(true);
    expect(canTransition("DELIVERED", "REFUNDED")).toBe(true);
  });

  it("非法流转被拒绝", () => {
    expect(canTransition("PENDING_PAYMENT", "DELIVERED")).toBe(false);
    expect(canTransition("DELIVERED", "SHIPPED")).toBe(false);
    expect(canTransition("CANCELLED", "PAID")).toBe(false);
    expect(canTransition("REFUNDED", "PAID")).toBe(false);
    expect(canTransition("SHIPPED", "PENDING_PAYMENT")).toBe(false);
    // 已支付 / 已履约的订单必须走 REFUNDED 流程，禁止直接 CANCELLED
    expect(canTransition("PAID", "CANCELLED")).toBe(false);
    expect(canTransition("PROCESSING", "CANCELLED")).toBe(false);
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(false);
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
  });

  it("终态无后继", () => {
    expect(ORDER_STATUS_FLOW.CANCELLED).toEqual([]);
    expect(ORDER_STATUS_FLOW.REFUNDED).toEqual([]);
  });

  it("assertTransition 抛出异常", () => {
    expect(() => assertTransition("DELIVERED", "SHIPPED")).toThrow("非法状态流转");
    expect(() => assertTransition("PAID", "DELIVERED")).toThrow();
  });

  it("可退款状态", () => {
    expect(REFUNDABLE_STATUSES).toEqual(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]);
  });

  it("状态中文标签完整", () => {
    for (const key of Object.keys(ORDER_STATUS_FLOW)) {
      expect(ORDER_STATUS_LABELS[key as keyof typeof ORDER_STATUS_LABELS]).toBeTruthy();
    }
  });
});
