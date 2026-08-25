import "server-only";
import { prisma } from "@/lib/prisma";

/** 管理端仪表盘统计 */

export async function getAdminStats() {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    revenue,
    orderCount,
    paidOrderCount,
    userCount,
    productCount,
    activeProductCount,
    pendingRefundCount,
    pendingShipCount,
    todayRevenue,
    todayOrders,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { total: true },
      where: { paidAt: { not: null }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
    }),
    prisma.order.count(),
    prisma.order.count({ where: { paidAt: { not: null } } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.product.count(),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.refund.count({ where: { status: "REQUESTED" } }),
    prisma.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { paidAt: { gte: dayStart }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
    }),
    prisma.order.count({ where: { createdAt: { gte: dayStart } } }),
  ]);

  // 近 14 天销售趋势
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
  const trendStart = days[0]!;
  const paidOrders = await prisma.order.findMany({
    where: { paidAt: { gte: trendStart }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
    select: { paidAt: true, total: true, status: true },
  });
  const trend = days.map((d) => {
    const key = d.toISOString().slice(0, 10);
    const dayOrders = paidOrders.filter(
      (o) => o.paidAt && o.paidAt.toISOString().slice(0, 10) === key,
    );
    return {
      date: key,
      orders: dayOrders.length,
      revenue: Math.round(dayOrders.reduce((s, o) => s + Number(o.total), 0) * 100) / 100,
    };
  });

  const recentOrders = await prisma.order.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      items: { select: { productName: true } },
    },
  });

  const topProducts = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: { soldCount: "desc" },
    take: 5,
    select: { id: true, name: true, slug: true, soldCount: true, stock: true, price: true },
  });

  return {
    revenue: Number(revenue._sum.total ?? 0),
    orderCount,
    paidOrderCount,
    userCount,
    productCount,
    activeProductCount,
    pendingRefundCount,
    pendingShipCount,
    todayRevenue: Number(todayRevenue._sum.total ?? 0),
    todayOrders,
    trend,
    recentOrders,
    topProducts,
  };
}
