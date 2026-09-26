import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRateSnapshot } from "@/components/shop/currency-server";
import { getSiteSettings } from "@/server/services/settings.service";
import { cacheGet, cacheSet } from "@/lib/cache";

/**
 * 管理端仪表盘统计。
 *
 * 多币种口径保持不变：
 * - Order.total / exchangeRate 是下单时快照；先按每单快照折回 USD；
 * - 再用当前 USD→CNY 汇率折算后台 CNY 展示值；
 * - 统计范围仍是 paidAt 非空且状态不是 CANCELLED / REFUNDED 的订单。
 *
 * 性能边界：营收总额、币种分组和 14 天趋势全部由 PostgreSQL 聚合，
 * 不再把全量已支付订单读入 Node 内存。趋势查询使用 Node 计算好的
 * 14 组本地日边界，因此跨夏令时切换时仍与原来的本地零点口径一致。
 */

type DbNumber = string | number | null;

/** 将订单金额按订单快照汇率转换为基础货币 USD。 */
export function toUsd(
  total: number | Prisma.Decimal,
  currency: string,
  exchangeRate: number | Prisma.Decimal | null,
): number {
  const amount = Number(total);
  const rate = Number(exchangeRate ?? 1);
  if (currency === "USD" || !rate || rate <= 0) return amount;
  return amount / rate;
}

/** 本地时区日期键（YYYY-MM-DD）。 */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface DailyRevenueAggregate {
  day: string;
  orders: number;
  revenueUsd: DbNumber;
}

/** 把数据库按日聚合结果补齐成前端固定 14 天序列。 */
export function buildRevenueTrend(
  days: Date[],
  rows: DailyRevenueAggregate[],
  usdToCny: number,
): { date: string; orders: number; revenue: number }[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return days.map((day) => {
    const key = localDateKey(day);
    const row = byDay.get(key);
    const revenueUsd = Number(row?.revenueUsd ?? 0);
    return {
      date: key,
      orders: Number(row?.orders ?? 0),
      revenue: Math.round(revenueUsd * usdToCny * 100) / 100,
    };
  });
}

/** 静态 SQL 片段：与原 Node toUsd 完全同口径。 */
const ORDER_TOTAL_USD_SQL = Prisma.sql`
  CASE
    WHEN "currency" = 'USD' OR COALESCE("exchangeRate", 0) <= 0 THEN "total"
    ELSE "total" / "exchangeRate"
  END
`;

const REVENUE_ELIGIBLE_SQL = Prisma.sql`
  "paidAt" IS NOT NULL
  AND "status" NOT IN ('CANCELLED', 'REFUNDED')
`;

/** Prisma DateTime 在 PostgreSQL 是 timestamp；用 UTC 字符串避免驱动/session TZ 二次转换。 */
function utcTimestampLiteral(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

interface RevenueTotalsRow {
  revenueUsd: DbNumber;
  todayRevenueUsd: DbNumber;
}

interface RevenueByCurrencyRow {
  currency: string;
  total: DbNumber;
  count: number;
  cnyEquivalent: DbNumber;
}

/**
 * 重统计部分（性能审计修复：仪表盘每次刷新对 50 万行 orders 做 ≥4 次全表扫）：
 * 3 条营收/趋势 SQL + 9 个 count 全部走 30s 缓存 —— recentOrders/topProducts
 * 是 take 8/5 的轻查询，保留实时（新订单即时可见），不进缓存（也避免
 * Date 字段经 JSON round-trip 变 string 的类型失真）。
 */
async function computeHeavyStats() {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 14 个本地自然日边界。拼成单个 CASE 后只扫描/聚合订单表一次；相比把 14 天
  // CTE 逐日 LEFT JOIN，在缺少 paidAt 索引的现有 schema 上不会退化成 14 次扫描。
  // 边界由 Node 计算，也避免 date_trunc 依赖 PostgreSQL session timezone。
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(now);
    day.setDate(day.getDate() - (13 - i));
    day.setHours(0, 0, 0, 0);
    return day;
  });
  const trendDayCases = days.map((day) => {
    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    return Prisma.sql`
      WHEN "paidAt" >= CAST(${utcTimestampLiteral(day)} AS timestamp)
       AND "paidAt" < CAST(${utcTimestampLiteral(end)} AS timestamp)
      THEN ${localDateKey(day)}::text
    `;
  });
  const trendDayCase = Prisma.join(trendDayCases, " ");
  const trendStartLiteral = utcTimestampLiteral(days[0]!);
  const trendEnd = new Date(days[days.length - 1]!);
  trendEnd.setDate(trendEnd.getDate() + 1);
  const trendEndLiteral = utcTimestampLiteral(trendEnd);

  // 获取 USD → CNY 汇率（用于后台人民币汇总）。
  const rateSnapshot = await getRateSnapshot();
  const usdToCny = rateSnapshot.rates["CNY"] ?? 7.2;

  // 库存预警阈值（后台可配）——低库存计数与商品筛选共用同一口径。
  const { lowStockThreshold } = await getSiteSettings();
  const todayStartLiteral = utcTimestampLiteral(dayStart);

  const [
    totalsRows,
    currencyRows,
    trendRows,
    orderCount,
    paidOrderCount,
    userCount,
    productCount,
    activeProductCount,
    pendingRefundCount,
    pendingShipCount,
    todayOrders,
    notifyMeCount,
    lowStockCount,
  ] = await Promise.all([
    prisma.$queryRaw<RevenueTotalsRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(${ORDER_TOTAL_USD_SQL}), 0)::text AS "revenueUsd",
        COALESCE(SUM(
          CASE
            WHEN "paidAt" >= CAST(${todayStartLiteral} AS timestamp)
            THEN ${ORDER_TOTAL_USD_SQL}
            ELSE 0
          END
        ), 0)::text AS "todayRevenueUsd"
      FROM "orders"
      WHERE ${REVENUE_ELIGIBLE_SQL}
    `),
    prisma.$queryRaw<RevenueByCurrencyRow[]>(Prisma.sql`
      SELECT
        "currency",
        COALESCE(SUM("total"), 0)::text AS "total",
        COUNT(*)::int AS "count",
        COALESCE(
          SUM(ROUND(
            (${ORDER_TOTAL_USD_SQL}) * CAST(${String(usdToCny)} AS numeric),
            2
          )),
          0
        )::text AS "cnyEquivalent"
      FROM "orders"
      WHERE ${REVENUE_ELIGIBLE_SQL}
      GROUP BY "currency"
    `),
    prisma.$queryRaw<DailyRevenueAggregate[]>(Prisma.sql`
      SELECT
        CASE ${trendDayCase} ELSE NULL END AS "day",
        COUNT(*)::int AS "orders",
        COALESCE(SUM(${ORDER_TOTAL_USD_SQL}), 0)::text AS "revenueUsd"
      FROM "orders"
      WHERE ${REVENUE_ELIGIBLE_SQL}
        AND "paidAt" >= CAST(${trendStartLiteral} AS timestamp)
        AND "paidAt" < CAST(${trendEndLiteral} AS timestamp)
      GROUP BY "day"
      ORDER BY "day" ASC
    `),
    prisma.order.count(),
    // 与营收一致：排除已取消/已全额退款。
    prisma.order.count({
      where: { paidAt: { not: null }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
    }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.product.count(),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.refund.count({ where: { status: "REQUESTED" } }),
    prisma.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
    prisma.order.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.notifyMe.count({ where: { status: "draft" } }),
    prisma.product.count({ where: { status: "ACTIVE", stock: { lte: lowStockThreshold } } }),
  ]);

  const totals = totalsRows[0] ?? { revenueUsd: 0, todayRevenueUsd: 0 };
  const revenueUsd = Number(totals.revenueUsd ?? 0);
  const todayRevenueUsd = Number(totals.todayRevenueUsd ?? 0);

  const revenueByCurrency: Record<string, { total: number; count: number; cnyEquivalent: number }> =
    {};
  for (const row of currencyRows) {
    const currency = row.currency || "USD";
    revenueByCurrency[currency] = {
      total: Number(row.total ?? 0),
      count: Number(row.count ?? 0),
      cnyEquivalent: Number(row.cnyEquivalent ?? 0),
    };
  }

  return {
    revenue: Math.round(revenueUsd * usdToCny * 100) / 100,
    revenueCurrency: "CNY",
    revenueUsd: Math.round(revenueUsd * 100) / 100,
    usdToCnyRate: usdToCny,
    revenueByCurrency,
    orderCount,
    paidOrderCount,
    userCount,
    productCount,
    activeProductCount,
    pendingRefundCount,
    pendingShipCount,
    todayRevenue: Math.round(todayRevenueUsd * usdToCny * 100) / 100,
    todayRevenueUsd: Math.round(todayRevenueUsd * 100) / 100,
    todayOrders,
    trend: buildRevenueTrend(days, trendRows, usdToCny),
    notifyMeCount,
    lowStockCount,
    lowStockThreshold,
  };
}

/**
 * 仪表盘统计入口（性能审计修复：30s 缓存 + 轻查询实时）。
 *
 * 缓存语义：统计数字（营收/趋势/各计数）最多滞后 30s —— 管理端可接受
 * （审计建议 30-60s）；TTL 自然过期，不做写路径失效联动（仪表盘非交易链路）。
 * recentOrders（take 8）/ topProducts（take 5）是索引命中的轻查询，实时执行，
 * 新订单即时出现在「最近订单」。
 */
const ADMIN_STATS_CACHE_KEY = "admin:stats:v1";
const ADMIN_STATS_CACHE_TTL = 30;

type HeavyAdminStats = Awaited<ReturnType<typeof computeHeavyStats>>;

export async function getAdminStats() {
  let heavy = await cacheGet<HeavyAdminStats>(ADMIN_STATS_CACHE_KEY);
  if (!heavy) {
    heavy = await computeHeavyStats();
    await cacheSet(ADMIN_STATS_CACHE_KEY, heavy, ADMIN_STATS_CACHE_TTL);
  }
  const [recentOrders, topProducts] = await Promise.all([
    prisma.order.findMany({
      take: 8,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      include: {
        user: { select: { name: true, email: true } },
        items: { select: { productName: true } },
      },
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ soldCount: "desc" }, { id: "asc" }],
      take: 5,
      select: { id: true, name: true, slug: true, soldCount: true, stock: true, price: true },
    }),
  ]);
  return { ...heavy, recentOrders, topProducts };
}

/** 显式失效仪表盘统计缓存（测试/运营手动刷新用；生产靠 30s TTL 自然过期） */
export async function invalidateAdminStatsCache(): Promise<void> {
  const { cacheDel } = await import("@/lib/cache");
  await cacheDel(ADMIN_STATS_CACHE_KEY);
}
