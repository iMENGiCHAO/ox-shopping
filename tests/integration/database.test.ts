/**
 * 集成测试说明：
 * - 需要 PostgreSQL（.env.test 中 DATABASE_URL 指向的库）与种子数据
 * - global-setup 会自动执行 prisma db push + db seed
 * - 未配置数据库时本文件测试将失败（单元测试不受影响）
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getAdminStats,
  invalidateAdminStatsCache,
  localDateKey,
  toUsd,
} from "@/server/services/stats.service";

const STATS_ORDER_PREFIX = `QA-STATS-${Date.now()}-`;

afterEach(async () => {
  await prisma.order.deleteMany({ where: { orderNumber: { startsWith: STATS_ORDER_PREFIX } } });
  if (vi.isMockFunction(prisma.order.findMany)) {
    vi.mocked(prisma.order.findMany).mockRestore();
  }
});

vi.mock("@/components/shop/currency-server", () => ({
  getRateSnapshot: vi.fn(async () => ({ rates: { CNY: 7.2 } })),
}));
vi.mock("@/server/services/settings.service", () => ({
  getSiteSettings: vi.fn(async () => ({ lowStockThreshold: 5 })),
}));

describe("数据库连通性", () => {
  beforeAll(async () => {
    // 确认数据库可用；不可用时给出明确提示
    try {
      await prisma.$connect();
    } catch {
      throw new Error(
        "无法连接测试数据库。请先启动 PostgreSQL 并在 .env.test 配置 DATABASE_URL，或跳过集成测试（npm run test:unit）",
      );
    }
  });

  it("种子数据已写入", async () => {
    const [users, products, categories] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.category.count(),
    ]);
    expect(users).toBeGreaterThanOrEqual(3);
    expect(products).toBeGreaterThanOrEqual(20);
    // 官方镜像目录为 2 个分类（Ox Collection / Ox Essentials Collection）
    expect(categories).toBeGreaterThanOrEqual(2);
  });

  it("种子账号存在且角色正确", async () => {
    const admin = await prisma.user.findUnique({ where: { email: "admin@example.com" } });
    const user = await prisma.user.findUnique({ where: { email: "user@example.com" } });
    expect(admin?.role).toBe("ADMIN");
    expect(user?.role).toBe("CUSTOMER");
  });

  it("订单/购物车表可用", async () => {
    await expect(prisma.order.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(prisma.cartItem.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});

describe("管理端统计数据库聚合", () => {
  it("订单汇率快照、币种分组与本地按日趋势和原 Node 口径一致", async () => {
    const orderFindMany = vi.spyOn(prisma.order, "findMany");
    const before = await getAdminStats();
    const now = new Date();
    const paidDaysAgo = (days: number) => {
      const date = new Date(now);
      date.setDate(date.getDate() - days);
      date.setHours(12, 0, 0, 0);
      return date;
    };

    const fixtures = [
      {
        orderNumber: `${STATS_ORDER_PREFIX}USD`,
        total: 101.11,
        currency: "USD",
        exchangeRate: 1,
        paidAt: paidDaysAgo(13),
        status: "PAID" as const,
      },
      {
        orderNumber: `${STATS_ORDER_PREFIX}CNY`,
        total: 675,
        currency: "CNY",
        exchangeRate: 6.75,
        paidAt: paidDaysAgo(2),
        status: "PAID" as const,
      },
      {
        orderNumber: `${STATS_ORDER_PREFIX}EUR`,
        total: 80,
        currency: "EUR",
        exchangeRate: 0.8,
        paidAt: now,
        status: "PAID" as const,
      },
      {
        orderNumber: `${STATS_ORDER_PREFIX}CANCELLED`,
        total: 999,
        currency: "CNY",
        exchangeRate: 6.75,
        paidAt: now,
        status: "CANCELLED" as const,
      },
      {
        orderNumber: `${STATS_ORDER_PREFIX}REFUNDED`,
        total: 999,
        currency: "USD",
        exchangeRate: 1,
        paidAt: now,
        status: "REFUNDED" as const,
      },
      {
        orderNumber: `${STATS_ORDER_PREFIX}UNPAID`,
        total: 999,
        currency: "EUR",
        exchangeRate: 0.8,
        paidAt: null,
        status: "PAID" as const,
      },
    ];

    await prisma.order.createMany({
      data: fixtures.map((fixture) => ({
        ...fixture,
        addressSnapshot: {},
        subtotal: fixture.total,
        shippingFee: 0,
        tax: 0,
        discount: 0,
      })),
    });

    // 统计带 30s 缓存（性能审计修复）：断言增量前显式失效，拿实时值
    await invalidateAdminStatsCache();
    const after = await getAdminStats();
    // getAdminStats 仍会取最近 8 单用于列表，但营收不得再走无 take 的全量 findMany。
    expect(orderFindMany).toHaveBeenCalledTimes(2);
    expect(orderFindMany.mock.calls.every(([args]) => (args as { take?: number }).take === 8)).toBe(
      true,
    );

    const included = fixtures.filter(
      (row) => row.paidAt && row.status !== "CANCELLED" && row.status !== "REFUNDED",
    );
    const expectedRevenueUsd = included.reduce(
      (sum, row) => sum + toUsd(row.total, row.currency, row.exchangeRate),
      0,
    );
    const rate = after.usdToCnyRate;

    expect(after.revenueUsd - before.revenueUsd).toBeCloseTo(
      Math.round(expectedRevenueUsd * 100) / 100,
      2,
    );
    expect(after.todayRevenueUsd - before.todayRevenueUsd).toBeCloseTo(100, 2);
    expect(after.revenue - before.revenue).toBeCloseTo(
      Math.round(expectedRevenueUsd * rate * 100) / 100,
      2,
    );
    expect(after.todayRevenue - before.todayRevenue).toBeCloseTo(720, 2);
    expect(after.orderCount - before.orderCount).toBe(fixtures.length);
    expect(after.paidOrderCount - before.paidOrderCount).toBe(included.length);
    expect(after.pendingShipCount - before.pendingShipCount).toBe(4);
    expect(after.todayOrders - before.todayOrders).toBe(fixtures.length);

    const currencyDelta = (code: string) => ({
      total:
        (after.revenueByCurrency[code]?.total ?? 0) - (before.revenueByCurrency[code]?.total ?? 0),
      count:
        (after.revenueByCurrency[code]?.count ?? 0) - (before.revenueByCurrency[code]?.count ?? 0),
      cnyEquivalent:
        (after.revenueByCurrency[code]?.cnyEquivalent ?? 0) -
        (before.revenueByCurrency[code]?.cnyEquivalent ?? 0),
    });
    const usdDelta = currencyDelta("USD");
    expect(usdDelta.count).toBe(1);
    expect(usdDelta.total).toBeCloseTo(101.11, 2);
    expect(usdDelta.cnyEquivalent).toBeCloseTo(727.99, 2);
    const cnyDelta = currencyDelta("CNY");
    expect(cnyDelta.count).toBe(1);
    expect(cnyDelta.total).toBeCloseTo(675, 2);
    expect(cnyDelta.cnyEquivalent).toBeCloseTo(720, 2);
    const eurDelta = currencyDelta("EUR");
    expect(eurDelta.count).toBe(1);
    expect(eurDelta.total).toBeCloseTo(80, 2);
    expect(eurDelta.cnyEquivalent).toBeCloseTo(720, 2);

    const beforeByDay = new Map(before.trend.map((row) => [row.date, row]));
    const afterByDay = new Map(after.trend.map((row) => [row.date, row]));
    const expectedByDay = new Map<string, { orders: number; revenueUsd: number }>();
    for (const row of included) {
      const key = localDateKey(row.paidAt!);
      const current = expectedByDay.get(key) ?? { orders: 0, revenueUsd: 0 };
      current.orders += 1;
      current.revenueUsd += toUsd(row.total, row.currency, row.exchangeRate);
      expectedByDay.set(key, current);
    }
    for (const [date, expected] of expectedByDay) {
      const previous = beforeByDay.get(date)!;
      const current = afterByDay.get(date)!;
      expect(current.orders - previous.orders).toBe(expected.orders);
      expect(current.revenue - previous.revenue).toBeCloseTo(
        Math.round(expected.revenueUsd * rate * 100) / 100,
        2,
      );
    }
  });
});
