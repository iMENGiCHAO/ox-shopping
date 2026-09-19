import "server-only";
import { prisma } from "@/lib/prisma";
import { getRateSnapshot } from "@/components/shop/currency-server";

/**
 * 管理端仪表盘统计
 *
 * 多币种结算说明：
 * - 订单存储用户选择的币种金额 + 汇率快照（1 USD 兑用户币种的汇率）
 * - 统计时先将每个订单金额根据其汇率快照转换为基础货币（USD）：USD 金额 = 用户币种金额 / 汇率
 * - 然后将 USD 金额转换为人民币（CNY）：CNY 金额 = USD 金额 × USD→CNY 汇率
 * - 已结算订单金额不再随汇率变动，因为使用的是订单创建时的汇率快照
 * - 同时按币种分组统计，显示多币种汇总（原始币种金额）
 * - 后台默认以人民币（CNY）作为显示和汇总货币，方便中国商家管理
 */

import type { Prisma } from "@prisma/client";

/** 将订单金额转换为 USD（基础货币） */
function toUsd(total: number | Prisma.Decimal, currency: string, exchangeRate: number | Prisma.Decimal | null): number {
  const amount = Number(total);
  const rate = Number(exchangeRate ?? 1);
  if (currency === "USD" || !rate || rate <= 0) return amount;
  return amount / rate;
}

/**
 * 本地时区日期键（YYYY-MM-DD）。
 * 必须与「今日营收」的 dayStart（本地零点）同口径；用 toISOString() 会按 UTC 分桶，
 * 导致趋势图最后一天永远缺"今天"、且两处营收对不上。
 */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getAdminStats() {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 获取 USD → CNY 汇率（用于后台人民币汇总）
  const rateSnapshot = await getRateSnapshot();
  const usdToCny = rateSnapshot.rates["CNY"] ?? 7.2;

  // 查询所有已支付订单（包含币种和汇率快照）
  const paidOrders = await prisma.order.findMany({
    where: { paidAt: { not: null }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
    select: { total: true, currency: true, exchangeRate: true, paidAt: true, status: true },
  });

  // 今日已支付订单
  const todayPaidOrders = paidOrders.filter((o) => o.paidAt && o.paidAt >= dayStart);

  // 计算总营收（先转换为 USD，再转换为 CNY）
  const revenueUsd = paidOrders.reduce((sum, o) => sum + toUsd(o.total, o.currency, o.exchangeRate), 0);
  const todayRevenueUsd = todayPaidOrders.reduce((sum, o) => sum + toUsd(o.total, o.currency, o.exchangeRate), 0);
  const revenue = Math.round(revenueUsd * usdToCny * 100) / 100;
  const todayRevenue = Math.round(todayRevenueUsd * usdToCny * 100) / 100;

  // 按币种分组统计（多币种汇总，显示原始币种金额）
  const revenueByCurrency: Record<string, { total: number; count: number; cnyEquivalent: number }> = {};
  for (const o of paidOrders) {
    const cur = o.currency || "USD";
    if (!revenueByCurrency[cur]) revenueByCurrency[cur] = { total: 0, count: 0, cnyEquivalent: 0 };
    revenueByCurrency[cur]!.total += Number(o.total);
    revenueByCurrency[cur]!.count += 1;
    // 计算该币种的人民币等值
    const orderUsd = toUsd(o.total, o.currency, o.exchangeRate);
    revenueByCurrency[cur]!.cnyEquivalent += Math.round(orderUsd * usdToCny * 100) / 100;
  }

  const [
    orderCount,
    paidOrderCount,
    userCount,
    productCount,
    activeProductCount,
    pendingRefundCount,
    pendingShipCount,
    todayOrders,
    // 数据打通：营销与用户行为数据统计（消除信息孤岛，admin 可全面了解业务）
    notifyMeCount,
    lowStockCount,
  ] = await Promise.all([
    prisma.order.count(),
    // 口径与营收一致：排除已取消/已退款，避免"营收不含退款单、订单数却含"的矛盾
    prisma.order.count({ where: { paidAt: { not: null }, status: { notIn: ["CANCELLED", "REFUNDED"] } } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.product.count(),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.refund.count({ where: { status: "REQUESTED" } }),
    prisma.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
    prisma.order.count({ where: { createdAt: { gte: dayStart } } }),
    // 到货提醒订阅总数（需求信号指标，admin 可据此安排补货）
    prisma.notifyMe.count({ where: { status: "draft" } }),
    // 低库存商品数（库存预警指标，stock <= 5 且 status = ACTIVE）
    prisma.product.count({ where: { status: "ACTIVE", stock: { lte: 5 } } }),
  ]);

  // 近 14 天销售趋势（先转换为 USD，再转换为 CNY）
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (13 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const trendStart = days[0]!;
  const trendOrders = paidOrders.filter((o) => o.paidAt && o.paidAt >= trendStart);
  const trend = days.map((d) => {
    const key = localDateKey(d);
    const dayOrders = trendOrders.filter(
      (o) => o.paidAt && localDateKey(o.paidAt) === key,
    );
    const dayUsd = dayOrders.reduce((s, o) => s + toUsd(o.total, o.currency, o.exchangeRate), 0);
    return {
      date: key,
      orders: dayOrders.length,
      revenue: Math.round(dayUsd * usdToCny * 100) / 100,
    };
  });

  const recentOrders = await prisma.order.findMany({
    take: 8,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: {
      user: { select: { name: true, email: true } },
      items: { select: { productName: true } },
    },
  });

  const topProducts = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ soldCount: "desc" }, { id: "asc" }],
    take: 5,
    select: { id: true, name: true, slug: true, soldCount: true, stock: true, price: true },
  });

  return {
    revenue,
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
    todayRevenue,
    todayRevenueUsd: Math.round(todayRevenueUsd * 100) / 100,
    todayOrders,
    trend,
    recentOrders,
    topProducts,
    // 数据打通：营销与用户行为指标
    notifyMeCount,
    lowStockCount,
  };
}
