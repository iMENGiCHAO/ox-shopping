import { describe, expect, it } from "vitest";
import { buildRevenueTrend, localDateKey, toUsd } from "@/server/services/stats.service";

describe("管理端统计 · 汇率与按日口径", () => {
  it("按订单汇率快照折回 USD，USD 订单不重复换算", () => {
    expect(toUsd(100, "USD", 7.2)).toBe(100);
    expect(toUsd(720, "CNY", 6.75)).toBeCloseTo(106.6666667, 6);
    expect(toUsd(100, "EUR", 0.8)).toBe(125);
  });

  it("缺失或非正汇率沿用历史防御口径，不把营收放大", () => {
    expect(toUsd(88, "CNY", null)).toBe(88);
    expect(toUsd(88, "CNY", 0)).toBe(88);
    expect(toUsd(88, "CNY", -1)).toBe(88);
  });

  it("本地日期键与本地零点口径一致", () => {
    const day = new Date(2026, 8, 24, 23, 59, 59, 999);
    expect(localDateKey(day)).toBe("2026-09-24");
  });

  it("按日聚合补齐 14 天序列并使用 USD→CNY 统一换算", () => {
    const days = [new Date(2026, 8, 23, 0), new Date(2026, 8, 24, 0)];
    const rows = [
      { day: "2026-09-23", orders: 2, revenueUsd: "10.005" },
      { day: "2026-09-24", orders: 1, revenueUsd: "20" },
    ];

    expect(buildRevenueTrend(days, rows, 7.2)).toEqual([
      { date: "2026-09-23", orders: 2, revenue: 72.04 },
      { date: "2026-09-24", orders: 1, revenue: 144 },
    ]);
  });

  it("数据库漏回某一天时前端补 0，不产生 undefined/NaN", () => {
    const days = [new Date(2026, 8, 24, 0)];
    expect(buildRevenueTrend(days, [], 7.2)).toEqual([
      { date: "2026-09-24", orders: 0, revenue: 0 },
    ]);
  });
});
