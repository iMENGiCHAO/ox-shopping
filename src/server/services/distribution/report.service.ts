import "server-only";
import type { OrderStatus } from "@prisma/client";
import type { WithdrawStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { CommissionState } from "@/lib/distribution/contract";
import {
  maskEmail,
  maskName,
  maskPhone,
  maskRegion,
  phoneFromSnapshot,
} from "@/lib/distribution/mask";
import { round2 } from "@/lib/distribution/rules";
import { getDistributionConfig, getDistributionEnabledAt } from "./config.service";
import { getClosure, getDescendantIds } from "./relation.service";
import {
  accrueForOrder,
  currentUsdToCny,
  settleDueOrders,
  settleOrder,
  syncOrderReversal,
  toCny,
} from "./commission.service";
import { attributeOrder } from "./bind.service";

/**
 * 分销**报表与团队视图**。
 *
 * 本文件是「行级权限 + 脱敏」的唯一出口：分销商能看什么，完全由这里决定，
 * **不依赖前端隐藏**（大爷明确要求"后端行级权限：不能只靠前端隐藏"）。
 *
 * 隐私口径（与产品文档 §13 一致）：
 *   - 直接客户：昵称（脱敏）、邮箱（脱敏）、手机号（脱敏）、省市、消费汇总、我的佣金；
 *   - 间接下级：**只给汇总**（人数 / 业绩 / 佣金），不给具体客户与订单明细；
 *   - 支付流水：分销商完全看不到。
 */

const COMMISSIONABLE: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

export interface MyCustomerRow {
  customerId: string;
  name: string;
  email: string;
  phone: string;
  bindTime: string;
  source: string | null;
  orderCount: number;
  spentCny: number;
  myCommissionCny: number;
}

export interface TeamOrderRow {
  orderNumber: string;
  status: string;
  currency: string;
  total: string;
  createdAt: string;
  buyerName: string;
  buyerPhone: string;
  region: string;
  myCommissionCny: number | null;
  level: number;
}

/** 我的直接客户（含消费汇总与我的佣金），敏感字段服务端脱敏 */
export async function getMyCustomers(
  distributorId: string,
  opts: { skip: number; take: number; q?: string },
): Promise<{ rows: MyCustomerRow[]; total: number }> {
  const where = {
    distributorId,
    status: "ACTIVE",
    ...(opts.q
      ? {
          customer: {
            OR: [
              { name: { contains: opts.q, mode: "insensitive" as const } },
              { email: { contains: opts.q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [binds, total, usdToCny] = await Promise.all([
    prisma.distributorCustomerBind.findMany({
      where,
      orderBy: [{ bindTime: "desc" }, { id: "asc" }],
      skip: opts.skip,
      take: opts.take,
      include: { customer: { select: { id: true, name: true, email: true } } },
    }),
    prisma.distributorCustomerBind.count({ where }),
    currentUsdToCny(),
  ]);

  // 绑定可能因用户注销而 SetNull → 过滤掉空值再查订单/佣金
  const ids = binds.map((b) => b.customerId).filter((v): v is string => !!v);
  if (ids.length === 0) return { rows: [], total };

  const [orders, commissions] = await Promise.all([
    prisma.order.findMany({
      where: {
        userId: { in: ids },
        paidAt: { not: null },
        status: { notIn: ["CANCELLED", "REFUNDED"] },
      },
      select: {
        userId: true,
        total: true,
        currency: true,
        exchangeRate: true,
        addressSnapshot: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commissionLog.groupBy({
      by: ["fromUserId"],
      where: {
        toUserId: distributorId,
        fromUserId: { in: ids },
        status: { in: ["PENDING", "SETTLED"] },
      },
      _sum: { amountCny: true },
    }),
  ]);

  const spend = new Map<string, { count: number; cny: number; phone: string }>();
  for (const o of orders) {
    if (!o.userId) continue;
    const cur = spend.get(o.userId) ?? { count: 0, cny: 0, phone: "" };
    cur.count += 1;
    cur.cny += toCny(Number(o.total), o.currency, Number(o.exchangeRate), usdToCny);
    if (!cur.phone) cur.phone = phoneFromSnapshot(o.addressSnapshot); // 最近一单的手机号
    spend.set(o.userId, cur);
  }
  const commissionByUser = new Map(
    commissions.map((c) => [c.fromUserId ?? "", Number(c._sum.amountCny ?? 0)]),
  );

  const liveBinds = binds.filter(
    (
      b,
    ): b is typeof b & {
      customerId: string;
      customer: { id: string; name: string; email: string };
    } => !!b.customerId && !!b.customer,
  );

  return {
    rows: liveBinds.map((b) => {
      const s = spend.get(b.customerId);
      return {
        customerId: b.customerId,
        name: maskName(b.customer.name),
        email: maskEmail(b.customer.email),
        phone: maskPhone(s?.phone),
        bindTime: b.bindTime.toISOString(),
        source: b.source,
        orderCount: s?.count ?? 0,
        spentCny: round2(s?.cny ?? 0),
        myCommissionCny: round2(commissionByUser.get(b.customerId) ?? 0),
      };
    }),
    total,
  };
}

/**
 * 我的团队订单。
 *
 * 只返回**直接客户**的订单明细（归属分销商 = 我）；
 * 下级团队的订单只进汇总（`getTeamStats`），不下发明细 —— 这是产品文档里
 * 「间接下级只看汇总，不看具体客户和订单明细」的落地。
 */
export async function getMyTeamOrders(
  distributorId: string,
  opts: { skip: number; take: number; status?: string },
): Promise<{ rows: TeamOrderRow[]; total: number }> {
  const where = {
    distributorId,
    natural: false,
    ...(opts.status ? { order: { status: opts.status as never } } : {}),
  };

  const [attributions, total] = await Promise.all([
    prisma.orderAttribution.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { orderId: "asc" }],
      skip: opts.skip,
      take: opts.take,
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            total: true,
            currency: true,
            createdAt: true,
            addressSnapshot: true,
            user: { select: { name: true } },
          },
        },
      },
    }),
    prisma.orderAttribution.count({ where }),
  ]);

  const orderIds = attributions.map((a) => a.orderId);
  const myLogs = orderIds.length
    ? await prisma.commissionLog.findMany({
        where: { orderId: { in: orderIds }, toUserId: distributorId },
        select: { orderId: true, amountCny: true, status: true },
      })
    : [];
  const commissionByOrder = new Map(
    myLogs.map((l) => [l.orderId, l.status === "REVERSED" ? 0 : Number(l.amountCny)]),
  );

  return {
    rows: attributions.map((a) => ({
      orderNumber: a.order?.orderNumber ?? "-",
      status: a.order?.status ?? "-",
      currency: a.order?.currency ?? "-",
      total: String(a.order?.total ?? "0"),
      createdAt: a.order?.createdAt.toISOString() ?? a.createdAt.toISOString(),
      buyerName: maskName(a.order?.user?.name),
      buyerPhone: maskPhone(phoneFromSnapshot(a.order?.addressSnapshot)),
      region: maskRegion(a.order?.addressSnapshot),
      myCommissionCny: commissionByOrder.get(a.orderId) ?? null,
      level: 1,
    })),
    total,
  };
}

/** 我的下级：直接下级给明细，间接下级只给汇总 */
export async function getMySubordinates(distributorId: string): Promise<{
  direct: {
    userId: string;
    name: string;
    email: string;
    joinedAt: string;
    level: number;
    bindCount: number;
    isDistributor: boolean;
  }[];
  indirect: { count: number };
  teamCount: number;
}> {
  const [directIds, allIds] = await Promise.all([
    getDescendantIds(distributorId, 1),
    getDescendantIds(distributorId),
  ]);

  const [users, bindCounts] = await Promise.all([
    directIds.length
      ? prisma.user.findMany({
          where: { id: { in: directIds } },
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            isDistributor: true,
            distLevel: true,
          },
        })
      : Promise.resolve([]),
    directIds.length
      ? prisma.distributorCustomerBind.groupBy({
          by: ["distributorId"],
          where: { distributorId: { in: directIds }, status: "ACTIVE" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const countMap = new Map(bindCounts.map((b) => [b.distributorId, b._count._all]));

  return {
    direct: users.map((u) => ({
      userId: u.id,
      name: maskName(u.name),
      email: maskEmail(u.email),
      joinedAt: u.createdAt.toISOString(),
      level: u.distLevel,
      bindCount: countMap.get(u.id) ?? 0,
      isDistributor: u.isDistributor,
    })),
    indirect: { count: Math.max(0, allIds.length - directIds.length) },
    teamCount: allIds.length,
  };
}

/** 团队业绩（含间接下级）：按日汇总，只给数字不给明细 */
export async function getTeamStats(
  distributorId: string,
  days = 30,
): Promise<{
  totalOrders: number;
  totalSalesCny: number;
  myTotalCommissionCny: number;
  series: { date: string; orders: number; salesCny: number; commissionCny: number }[];
  /** 数据来源：rollup = 读预聚合表；live = 回落实时聚合（尚无汇总数据时） */
  source: "rollup" | "live";
}> {
  /* P2-12：优先读日汇总表。它由 `rollupDistributionDailyStats()` 幂等写入，
     大团队/长窗口下把"每次打开页面全表扫描"变成"读 N 行小表"。
     明细页（客户/订单/佣金）仍读实时表 —— 汇总只是加速视图，不是真相来源。 */
  const rolled = await getDailyStatSeries(distributorId, days);
  /* 覆盖度判断（P1 修复）：日汇总由调度器写入（bridge 钩子只补最近 2 天），
     模块刚启用或调度器停跑数日时，窗口内可能只有零散几行。此前只要
     `rolled.length > 0` 就返回预聚合 —— 30 天窗口静默只统计 2 天，
     团队业绩比真实值小一个数量级，且页面上没有任何提示。
     现在只在「窗口首日已被汇总覆盖」时用预聚合，否则回落实时口径。 */
  const windowStartDay = startOfUtcDay(new Date(Date.now() - (days - 1) * 86_400_000))
    .toISOString()
    .slice(0, 10);
  const covered = rolled.length > 0 && rolled[0]!.date <= windowStartDay;
  if (covered) {
    return {
      totalOrders: rolled.reduce((s, r) => s + r.orders, 0),
      totalSalesCny: round2(rolled.reduce((s, r) => s + r.salesCny, 0)),
      myTotalCommissionCny: round2(rolled.reduce((s, r) => s + r.commissionCny, 0)),
      series: rolled,
      source: "rollup",
    };
  }
  const live = await getTeamStatsLive(distributorId, days);
  return { ...live, source: "live" };
}

/** 实时聚合实现（预聚合缺失/被清理时的兜底，保证页面永远有数） */
async function getTeamStatsLive(
  distributorId: string,
  days: number,
): Promise<{
  totalOrders: number;
  totalSalesCny: number;
  myTotalCommissionCny: number;
  series: { date: string; orders: number; salesCny: number; commissionCny: number }[];
}> {
  const from = new Date(Date.now() - days * 86_400_000);
  const teamIds = [distributorId, ...(await getDescendantIds(distributorId))];

  const [attributions, commissions, usdToCny] = await Promise.all([
    prisma.orderAttribution.findMany({
      where: { distributorId: { in: teamIds }, natural: false, createdAt: { gte: from } },
      select: {
        createdAt: true,
        order: {
          select: {
            total: true,
            currency: true,
            exchangeRate: true,
            paidAt: true,
            status: true,
          },
        },
      },
    }),
    prisma.commissionLog.findMany({
      where: {
        toUserId: distributorId,
        createdAt: { gte: from },
        status: { in: ["PENDING", "SETTLED"] },
      },
      select: { createdAt: true, amountCny: true },
    }),
    currentUsdToCny(),
  ]);

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const series = new Map<string, { orders: number; salesCny: number; commissionCny: number }>();
  const bump = (
    key: string,
    patch: Partial<{ orders: number; salesCny: number; commissionCny: number }>,
  ) => {
    const cur = series.get(key) ?? { orders: 0, salesCny: 0, commissionCny: 0 };
    series.set(key, {
      orders: cur.orders + (patch.orders ?? 0),
      salesCny: cur.salesCny + (patch.salesCny ?? 0),
      commissionCny: cur.commissionCny + (patch.commissionCny ?? 0),
    });
  };

  let totalOrders = 0;
  let totalSalesCny = 0;
  for (const a of attributions) {
    const o = a.order;
    if (!o || !o.paidAt || o.status === "CANCELLED" || o.status === "REFUNDED") continue;
    const cny = toCny(Number(o.total), o.currency, Number(o.exchangeRate), usdToCny);
    totalOrders += 1;
    totalSalesCny += cny;
    bump(dayKey(o.paidAt), { orders: 1, salesCny: cny });
  }

  let myTotal = 0;
  for (const c of commissions) {
    const v = Number(c.amountCny);
    myTotal += v;
    bump(dayKey(c.createdAt), { commissionCny: v });
  }

  return {
    totalOrders,
    totalSalesCny: round2(totalSalesCny),
    myTotalCommissionCny: round2(myTotal),
    series: [...series.entries()]
      .map(([date, v]) => ({
        date,
        orders: v.orders,
        salesCny: round2(v.salesCny),
        commissionCny: round2(v.commissionCny),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/* ─────────────────────────── 平台侧（管理员） ─────────────────────────── */

export async function getAdminOverview(): Promise<{
  distributors: number;
  teamMembers: number;
  binds: number;
  commissionByStatus: Record<string, { count: number; amountCny: number }>;
  pendingWithdraw: { count: number; amountCny: number };
}> {
  const [distributors, relations, binds, grouped, withdrawGroup] = await Promise.all([
    prisma.user.count({ where: { isDistributor: true } }),
    prisma.distributionRelation.count({ where: { depth: { gte: 1 } } }),
    prisma.distributorCustomerBind.count({ where: { status: "ACTIVE" } }),
    prisma.commissionLog.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amountCny: true },
    }),
    prisma.withdrawRecord.groupBy({
      by: ["status"],
      where: { status: { in: ["PENDING", "APPROVED"] } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const commissionByStatus: Record<string, { count: number; amountCny: number }> = {
    PENDING: { count: 0, amountCny: 0 },
    SETTLED: { count: 0, amountCny: 0 },
    REVERSED: { count: 0, amountCny: 0 },
  };
  for (const g of grouped) {
    commissionByStatus[g.status] = {
      count: g._count._all,
      amountCny: round2(Number(g._sum.amountCny ?? 0)),
    };
  }

  return {
    distributors,
    teamMembers: relations,
    binds,
    commissionByStatus,
    pendingWithdraw: {
      count: withdrawGroup.reduce((s, g) => s + g._count._all, 0),
      amountCny: round2(withdrawGroup.reduce((s, g) => s + Number(g._sum.amount ?? 0), 0)),
    },
  };
}

/** 关系链查询（管理员）：某人的上级链 + 下级统计 + 绑定 */
export async function getAdminRelations(userId: string): Promise<{
  user: {
    id: string;
    name: string;
    email: string;
    isDistributor: boolean;
    distLevel: number;
    referralCode: string | null;
  } | null;
  ancestors: { userId: string; name: string; email: string; depth: number }[];
  directCount: number;
  teamCount: number;
  bind: {
    id: string;
    distributorId: string;
    distributorName: string;
    bindTime: string;
    source: string | null;
  } | null;
  invitees: { id: string; name: string; email: string; isDistributor: boolean }[];
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isDistributor: true,
      distLevel: true,
      referralCode: true,
    },
  });
  if (!user) {
    return { user: null, ancestors: [], directCount: 0, teamCount: 0, bind: null, invitees: [] };
  }

  const [closure, directCount, teamCount, bind, invitees] = await Promise.all([
    getClosure(userId),
    prisma.distributionRelation.count({ where: { ancestorId: userId, depth: 1 } }),
    prisma.distributionRelation.count({ where: { ancestorId: userId, depth: { gte: 1 } } }),
    prisma.distributorCustomerBind.findUnique({
      where: { customerId: userId },
      include: { distributor: { select: { id: true, name: true } } },
    }),
    prisma.user.findMany({
      where: { invitedById: userId },
      select: { id: true, name: true, email: true, isDistributor: true },
      take: 200,
    }),
  ]);

  const ancestorIds = closure.filter((c) => c.depth > 0).map((c) => c.userId);
  const ancestorUsers = ancestorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ancestorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const nameMap = new Map(ancestorUsers.map((u) => [u.id, u]));

  return {
    user,
    ancestors: closure
      .filter((c) => c.depth > 0)
      .map((c) => ({
        userId: c.userId,
        name: nameMap.get(c.userId)?.name ?? "-",
        email: nameMap.get(c.userId)?.email ?? "-",
        depth: c.depth,
      })),
    directCount,
    teamCount,
    bind:
      bind && bind.status === "ACTIVE" && bind.distributorId && bind.distributor
        ? {
            id: bind.id,
            distributorId: bind.distributorId,
            distributorName: bind.distributor.name,
            bindTime: bind.bindTime.toISOString(),
            source: bind.source,
          }
        : null,
    invitees,
  };
}

/** 平台佣金流水（管理员：全量 + 可筛选） */
export async function getAdminCommissionLogs(opts: {
  skip: number;
  take: number;
  status?: CommissionState;
  orderNumber?: string;
}): Promise<{
  rows: {
    id: string;
    orderNumber: string;
    fromUser: string;
    toUser: string;
    level: number;
    ratio: number;
    amount: number;
    amountCny: number;
    currency: string;
    status: CommissionState;
    createdAt: string;
    settledAt: string | null;
    reversedAt: string | null;
  }[];
  total: number;
}> {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.orderNumber ? { order: { orderNumber: { contains: opts.orderNumber } } } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.commissionLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: opts.skip,
      take: opts.take,
      include: {
        order: { select: { orderNumber: true } },
        toUser: { select: { name: true, email: true } },
        fromUser: { select: { name: true, email: true } },
      },
    }),
    prisma.commissionLog.count({ where }),
  ]);

  return {
    rows: logs.map((l) => ({
      id: l.id,
      orderNumber: l.order?.orderNumber ?? "-",
      fromUser: l.fromUser
        ? `${l.fromUser.name}（${maskEmail(l.fromUser.email)}）`
        : "（游客/已注销）",
      // 受益人可能已注销（toUserId 置 NULL）→ 回落到流水快照，账目仍可追溯
      toUser: l.toUser
        ? `${l.toUser.name}（${maskEmail(l.toUser.email)}）`
        : l.toUserName
          ? `${l.toUserName}（已注销）`
          : "（已注销）",
      level: l.level,
      ratio: Number(l.ratio),
      amount: Number(l.amount),
      amountCny: Number(l.amountCny),
      currency: l.currency,
      status: l.status as CommissionState,
      createdAt: l.createdAt.toISOString(),
      settledAt: l.settledAt?.toISOString() ?? null,
      reversedAt: l.reversedAt?.toISOString() ?? null,
    })),
    total,
  };
}

/**
 * 对账报表：佣金总支出 vs 订单收入 vs 毛估。
 * 「毛利」需要成本价（`Product.costPrice`），缺失的按 0 计并在返回里标注覆盖率，
 * 避免把「没录成本」误读成「毛利 100%」。
 */
export async function getAdminReport(days = 30): Promise<{
  days: number;
  paidOrders: number;
  paidRevenueCny: number;
  /** 佣金总支出（净额口径）= 已结算 + 待结算，不含已全额冲正的流水 */
  commissionTotalCny: number;
  /** 其中已结算（净额：已扣除冲正部分） */
  commissionSettledCny: number;
  /** 其中待结算 / 在途（净额） */
  commissionPendingCny: number;
  /** 已冲正金额合计（含部分冲正，与「支出」互斥，单列供运营核对） */
  commissionReversedCny: number;
  estimatedGrossProfitCny: number;
  costCoverage: number;
  payoutRatio: number;
}> {
  const from = new Date(Date.now() - days * 86_400_000);
  const usdToCny = await currentUsdToCny();

  const [orders, grouped] = await Promise.all([
    prisma.order.findMany({
      where: { paidAt: { gte: from, not: null }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
      select: {
        total: true,
        currency: true,
        exchangeRate: true,
        items: {
          select: {
            quantity: true,
            price: true,
            product: { select: { costPrice: true } },
          },
        },
      },
    }),
    // 带 reversedCny：部分退款后流水仍是 PENDING/SETTLED，
    // 只看 amountCny 会把已冲正的部分也算成佣金支出（payoutRatio 虚高）。
    prisma.commissionLog.groupBy({
      by: ["status"],
      where: { createdAt: { gte: from } },
      _sum: { amountCny: true, reversedCny: true },
    }),
  ]);

  let revenueCny = 0;
  let costCny = 0;
  let itemsWithCost = 0;
  let itemsTotal = 0;
  for (const o of orders) {
    revenueCny += toCny(Number(o.total), o.currency, Number(o.exchangeRate), usdToCny);
    for (const it of o.items) {
      itemsTotal += 1;
      const cost = Number(it.product?.costPrice ?? 0);
      if (cost > 0) itemsWithCost += 1;
      costCny += toCny(cost * it.quantity, o.currency, Number(o.exchangeRate), usdToCny);
    }
  }

  /* 净额口径（P1 修复）：每笔流水可贡献的收入 = amountCny − reversedCny；
     REVERSED 桶是「已全额冲正」的行，不再计入支出，只并入「已冲正」合计
     供运营核对。此前 `settled + pending + reversed` 会把已冲正金额算进
     总支出，使 payoutRatio 虚高、返佣成本误判。 */
  let settled = 0;
  let pending = 0;
  let reversedTotal = 0;
  for (const g of grouped) {
    const gross = Number(g._sum.amountCny ?? 0);
    const offset = Number(g._sum.reversedCny ?? 0);
    reversedTotal = round2(reversedTotal + offset);
    const net = Math.max(0, round2(gross - offset));
    if (g.status === "SETTLED") settled = round2(settled + net);
    else if (g.status === "PENDING") pending = round2(pending + net);
    else if (g.status === "REVERSED" && offset <= 0) {
      // 历史数据兜底：REVERSED 行若没有 reversedCny，用原始额视为已冲正
      reversedTotal = round2(reversedTotal + Math.abs(gross));
    }
  }
  const commissionTotal = round2(settled + pending);
  const grossProfit = round2(revenueCny - costCny);

  return {
    days,
    paidOrders: orders.length,
    paidRevenueCny: round2(revenueCny),
    commissionTotalCny: commissionTotal,
    commissionSettledCny: settled,
    commissionPendingCny: pending,
    commissionReversedCny: reversedTotal,
    estimatedGrossProfitCny: grossProfit,
    costCoverage: itemsTotal > 0 ? round2((itemsWithCost / itemsTotal) * 100) : 0,
    payoutRatio: revenueCny > 0 ? round2((commissionTotal / revenueCny) * 100) : 0,
  };
}

/**
 * 对账补偿（调度器每分钟调用，幂等）。
 *
 * 为什么必须有它：佣金是钱，而商城侧的接入点只有 4 个（下单/支付/发货/退款），
 * 任何一次漏调、进程崩溃、或历史订单在模块上线前就已支付，都会造成漏记/漏冲正。
 * 与其在商城业务代码里到处埋钩子（耦合 + 遗漏风险），不如让分销模块**自己扫平**：
 *   ① 已支付但无归属快照 → 补记归属
 *   ② 有归属但无佣金流水 → 补算佣金
 *   ③ 已退款/取消但佣金未冲正 → 冲正
 *   ④ 已确认收货 → 立即结算
 *   ⑤ 支付满持有期 → 结算
 */
export async function reconcileDistribution(limit = 100): Promise<{
  attributed: number;
  accrued: number;
  reversed: number;
  settled: number;
  archivedNatural: number;
}> {
  let attributed = 0;
  let accrued = 0;
  let reversed = 0;
  let settled = 0;
  let archivedNatural = 0;

  // 模块启用时间基线：早于它的历史订单**不按当前绑定回溯归属**（会用今天的绑定改写历史），
  // 一次性写成自然单，之后不再反复扫描（P0-4）
  const enabledAt = await getDistributionEnabledAt();

  const orphans = await prisma.order.findMany({
    where: {
      paidAt: { not: null },
      status: { in: COMMISSIONABLE },
      attribution: null,
    },
    select: { id: true, userId: true, createdAt: true },
    take: limit,
  });
  for (const o of orphans) {
    if (o.createdAt < enabledAt) {
      await prisma.orderAttribution.upsert({
        where: { orderId: o.id },
        create: { orderId: o.id, distributorId: null, natural: true },
        update: {},
      });
      archivedNatural += 1;
      continue;
    }
    await attributeOrder({ orderId: o.id, userId: o.userId });
    attributed += 1;
  }

  const missing = await prisma.order.findMany({
    where: {
      paidAt: { not: null },
      status: { in: COMMISSIONABLE },
      attribution: { distributorId: { not: null } },
      commissions: { none: {} },
    },
    select: { id: true },
    take: limit,
  });
  for (const o of missing) {
    const res = await accrueForOrder(o.id);
    accrued += res.count > 0 ? 1 : 0;
  }

  // 冲正候选 = 整单退款/取消的订单 ∪ **存在已完成退款单**的订单（覆盖部分退款）
  const [stale, partial] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: { in: ["REFUNDED", "CANCELLED"] },
        // 只挑「还存在未冲正佣金」的订单：已冲干净的订单不再参与每分钟扫描
        commissions: { some: { status: { not: "REVERSED" } } },
      },
      select: { id: true },
      // 新单优先（P1 修复）：无排序时 take 会反复返回同一批旧单，
      // 新的「已退款未冲正」订单可能永远扫不到（退款钩子失败即永久漏冲正）。
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.refund.findMany({
      where: {
        status: "REFUNDED",
        order: { commissions: { some: { status: { not: "REVERSED" } } } },
      },
      select: { orderId: true },
      distinct: ["orderId"],
      // 同上：部分冲正不会把流水置 REVERSED，候选集会长期保留这类单，
      // 必须让最新的退款单优先进入本次扫描。
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);
  const reversalCandidates = new Set<string>([
    ...stale.map((o) => o.id),
    ...partial.map((r) => r.orderId),
  ]);
  for (const orderId of reversalCandidates) {
    if ((await syncOrderReversal(orderId, "对账补偿：按退款比例冲正")) > 0) reversed += 1;
  }

  const delivered = await prisma.order.findMany({
    where: { status: "DELIVERED", commissions: { some: { status: "PENDING" } } },
    select: { id: true },
    take: limit,
  });
  for (const o of delivered) {
    if ((await settleOrder(o.id)) > 0) settled += 1;
  }

  const due = await settleDueOrders(limit);
  settled += due.orders;

  if (attributed || accrued || reversed || settled || archivedNatural) {
    logger.info(
      { attributed, accrued, reversed, settled, archivedNatural },
      "分销：对账补偿完成（有修正动作）",
    );
  }
  return { attributed, accrued, reversed, settled, archivedNatural };
}

/* ─────────────────────────── P1-8 风控视图 / 升级记录 / 导出 ─────────────────────────── */

export interface RiskFinding {
  id: string;
  /** self_purchase | negative_balance | high_refund | large_withdraw | over_level_rule */
  kind: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  /** 关联主体（用户/订单/规则 id），便于后台跳转 */
  refType: string;
  refId: string;
  at: string;
}

/**
 * 风控视图（P1-8）：把「钱可能算错/被薅」的信号集中成一张可读列表。
 *
 * 覆盖五类信号（都是真实业务里会出现的）：
 *   1. **自购返佣**：`fromUserId === toUserId` 的佣金流水（自买自返/刷单的典型特征）；
 *   2. **负余额账户**：退款冲正后余额为负（挂账），需要运营知道谁在倒欠；
 *   3. **高频退款**：近 30 天退款单 ≥ 3 的客户（可能是刷单后用退款洗掉）；
 *   4. **大额在途提现**：待审核/已通过的提现 ≥ 阈值（默认 ¥1000）；
 *   5. **超层级规则**：配置了超过 `maxCommissionLevels` 的佣金规则（配了但永不生效，
 *      容易让运营误以为"已经在返 4 级"）。
 */
export async function getRiskReport(options: { largeWithdrawThreshold?: number } = {}): Promise<{
  findings: RiskFinding[];
  counts: Record<string, number>;
}> {
  const threshold = options.largeWithdrawThreshold ?? 1000;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const config = await getDistributionConfig();

  const [selfBuys, negatives, refundHeavy, bigWithdraws, overRules] = await Promise.all([
    /* 自购判定下推到数据库（P1 修复）：此前「取最近 200 条流水 → 内存过滤
       fromUserId === toUserId」，流水一旦超过 200 条，较早的自购记录就永远
       进不了视图 —— 而自购返佣（自买自返/刷单）正是风控最核心的信号，
       漏报等于风控形同虚设。这里用原生 SQL 在库内完成字段对字段比较。 */
    (async () => {
      const selfBuyIds = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM commission_logs
        WHERE "fromUserId" = "toUserId" AND status IN ('PENDING', 'SETTLED')
        ORDER BY "createdAt" DESC
        LIMIT 200
      `;
      if (selfBuyIds.length === 0) return [];
      return prisma.commissionLog.findMany({
        where: { id: { in: selfBuyIds.map((r) => r.id) } },
        select: {
          id: true,
          orderId: true,
          fromUserId: true,
          toUserId: true,
          amountCny: true,
          createdAt: true,
          toUserName: true,
          toUserEmail: true,
          order: { select: { orderNumber: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    })(),
    prisma.distributorAccount.findMany({
      where: { balance: { lt: 0 } },
      select: { userId: true, balance: true, user: { select: { email: true, name: true } } },
      orderBy: { balance: "asc" },
      take: 50,
    }),
    prisma.refund.groupBy({
      by: ["userId"],
      where: { status: "REFUNDED", createdAt: { gte: since }, userId: { not: null } },
      _count: { _all: true },
      _sum: { amount: true },
      having: { userId: { _count: { gte: 3 } } },
    }),
    prisma.withdrawRecord.findMany({
      where: { status: { in: ["PENDING", "APPROVED"] }, amount: { gte: threshold } },
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        createdAt: true,
        payeeName: true,
        userEmail: true,
      },
      orderBy: { amount: "desc" },
      take: 50,
    }),
    prisma.commissionRule.findMany({
      where: { enabled: true, level: { gt: config.maxCommissionLevels } },
      select: { id: true, scopeType: true, scopeId: true, level: true, ratio: true },
    }),
  ]);

  const findings: RiskFinding[] = [];

  for (const log of selfBuys) {
    if (!log.fromUserId || log.fromUserId !== log.toUserId) continue;
    findings.push({
      id: `self:${log.id}`,
      kind: "self_purchase",
      severity: "high",
      title: "自购返佣",
      detail: `${log.toUserName ?? "（已注销）"} 在自己下单的订单 ${log.order?.orderNumber ?? "-"} 上获得了 ¥${Number(log.amountCny).toFixed(2)} 佣金`,
      refType: "order",
      refId: log.orderId,
      at: log.createdAt.toISOString(),
    });
  }

  for (const acc of negatives) {
    findings.push({
      id: `neg:${acc.userId}`,
      kind: "negative_balance",
      severity: "medium",
      title: "账户余额为负（退款冲正挂账）",
      detail: `${acc.user?.name ?? "（已注销）"}（${acc.user?.email ?? "-"}）余额 ¥${Number(acc.balance).toFixed(2)}，将由后续佣金抵扣`,
      refType: "user",
      refId: acc.userId,
      at: new Date().toISOString(),
    });
  }

  const refundUsers = refundHeavy.map((r) => r.userId).filter((v): v is string => !!v);
  if (refundUsers.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: refundUsers } },
      select: { id: true, name: true, email: true },
    });
    const nameMap = new Map(users.map((u) => [u.id, u]));
    for (const r of refundHeavy) {
      if (!r.userId) continue;
      const u = nameMap.get(r.userId);
      findings.push({
        id: `refund:${r.userId}`,
        kind: "high_refund",
        severity: "medium",
        title: "近 30 天高频退款",
        detail: `${u?.name ?? "（已注销）"}（${u?.email ?? "-"}）30 天内退款 ${r._count._all} 笔，累计 ¥${Number(r._sum.amount ?? 0).toFixed(2)}`,
        refType: "user",
        refId: r.userId,
        at: new Date().toISOString(),
      });
    }
  }

  for (const w of bigWithdraws) {
    findings.push({
      id: `wd:${w.id}`,
      kind: "large_withdraw",
      severity: w.amount && Number(w.amount) >= threshold * 5 ? "high" : "medium",
      title: "大额在途提现",
      detail: `${w.payeeName ?? "（未填写实名）"}（${w.userEmail ?? "-"}）¥${Number(w.amount).toFixed(2)} · ${w.status}`,
      refType: "withdraw",
      refId: w.id,
      at: w.createdAt.toISOString(),
    });
  }

  for (const rule of overRules) {
    findings.push({
      id: `rule:${rule.id}`,
      kind: "over_level_rule",
      severity: "low",
      title: "规则层级超出返佣上限",
      detail: `${rule.scopeType}${rule.scopeId ? `/${rule.scopeId}` : ""} 第 ${rule.level} 级配置了 ${Number(rule.ratio)}%，但层级上限是 ${config.maxCommissionLevels} —— 该规则永不生效`,
      refType: "rule",
      refId: rule.id,
      at: new Date().toISOString(),
    });
  }

  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;

  return { findings, counts };
}

/** 自动升级记录（P1-8）：谁在什么时候因为哪次推广自动成为分销商 */
export async function getPromotionLog(opts: { skip: number; take: number }): Promise<{
  rows: {
    userId: string;
    name: string;
    email: string;
    firstPromoteAt: string;
    invitedBy: string | null;
    inviteeCount: number;
  }[];
  total: number;
}> {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: { isDistributor: true, firstPromoteAt: { not: null } },
      orderBy: [{ firstPromoteAt: "desc" }, { id: "asc" }],
      skip: opts.skip,
      take: opts.take,
      select: {
        id: true,
        name: true,
        email: true,
        firstPromoteAt: true,
        invitedBy: { select: { name: true, email: true } },
        _count: { select: { invitees: true } },
      },
    }),
    prisma.user.count({ where: { isDistributor: true, firstPromoteAt: { not: null } } }),
  ]);

  return {
    rows: users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: maskEmail(u.email),
      firstPromoteAt: u.firstPromoteAt!.toISOString(),
      invitedBy: u.invitedBy ? `${u.invitedBy.name}（${maskEmail(u.invitedBy.email)}）` : null,
      inviteeCount: u._count.invitees,
    })),
    total,
  };
}

/**
 * 导出上限。超过时**必须让运营看得见** —— 财务据缺行的 CSV 对账会得出
 * 错误结论（此前静默 `take: 10_000`，超出部分无声丢弃）。
 */
const EXPORT_LIMIT = 10_000;

export interface ExportResult {
  rows: Record<string, unknown>[];
  /** 满足筛选条件的总行数（未截断时等于 rows.length） */
  total: number;
  truncated: boolean;
}

/** 佣金流水导出（P1-8）：管理员全量导出 CSV 用 */
export async function exportCommissionRows(filter: {
  status?: CommissionState;
  orderNumber?: string;
}): Promise<ExportResult> {
  const where = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.orderNumber
      ? { order: { orderNumber: { contains: filter.orderNumber, mode: "insensitive" as const } } }
      : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.commissionLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: EXPORT_LIMIT,
      include: {
        order: { select: { orderNumber: true } },
        toUser: { select: { name: true, email: true } },
        fromUser: { select: { name: true, email: true } },
      },
    }),
    prisma.commissionLog.count({ where }),
  ]);

  const rows = logs.map((l) => ({
    订单号: l.order?.orderNumber ?? "",
    层级: l.level,
    比例: l.ratio == null ? "" : Number(l.ratio),
    订单币种: l.currency,
    订单金额: Number(l.amount),
    折合人民币: Number(l.amountCny),
    已冲正金额: Number(l.reversedAmount),
    已冲正人民币: Number(l.reversedCny),
    状态: l.status,
    // 用户注销后走流水快照，保证导出与账本一致
    受益人: l.toUser?.name ?? l.toUserName ?? "（已注销）",
    受益人邮箱: l.toUser?.email ?? l.toUserEmail ?? "",
    下单人: l.fromUser?.name ?? "（游客/已注销）",
    下单人邮箱: l.fromUser?.email ?? "",
    创建时间: l.createdAt.toISOString(),
    结算时间: l.settledAt?.toISOString() ?? "",
    冲正时间: l.reversedAt?.toISOString() ?? "",
    备注: l.note ?? "",
  }));

  return { rows, total, truncated: total > logs.length };
}

/** 提现导出（P1-8） */
export async function exportWithdrawRows(filter: {
  status?: WithdrawStatus;
}): Promise<ExportResult> {
  const where = filter.status ? { status: filter.status } : {};
  const [records, total] = await Promise.all([
    prisma.withdrawRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: EXPORT_LIMIT,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.withdrawRecord.count({ where }),
  ]);

  const rows = records.map((r) => ({
    申请时间: r.createdAt.toISOString(),
    申请人: r.user?.name ?? "（已注销）",
    邮箱: r.user?.email ?? r.userEmail ?? "",
    金额: Number(r.amount),
    状态: r.status,
    收款人实名: r.payeeName ?? "",
    收款方式: r.payeeMethod ?? "",
    收款账户: r.accountInfo ?? "",
    申请备注: r.remark ?? "",
    审核备注: r.auditNote ?? "",
    打款备注: r.payNote ?? "",
    审核时间: r.auditedAt?.toISOString() ?? "",
    打款时间: r.paidAt?.toISOString() ?? "",
  }));

  return { rows, total, truncated: total > records.length };
}

/* ─────────────────────────── P2-12 团队业绩预聚合 ─────────────────────────── */

/** 把时间归一化到当天 00:00 UTC（DATE 列口径，避免时区把一天切成两天） */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * 汇总「分销商 × 日」业绩到 `distribution_daily_stats`（幂等，可重跑）。
 *
 * 口径（与实时口径一致，避免"报表和明细对不上"）：
 *   · orders/salesCny ← `order_attributions` 指向该分销商、且当日**已支付**、
 *     状态非取消/退款的订单（销售额按订单汇率快照折算成 CNY）；
 *   · commissionCny ← 当日创建的佣金流水（含在途/已结算，冲正的记为 0 —— 与
 *     `summariseCommission` 口径一致）；
 *   · teamSize ← 汇总时刻的团队人数快照。
 *
 * @param opts.days 回溯天数（默认 3：昨天到今天，容错调度器偶尔没跑）
 */
export async function rollupDistributionDailyStats(
  opts: { days?: number; at?: Date } = {},
): Promise<{
  days: number;
  rows: number;
}> {
  const at = opts.at ?? new Date();
  const days = opts.days ?? 3;
  let written = 0;
  // 折算基准：订单币种 → USD → CNY（与计佣 toCny 同源，见 commission.service.toCny）
  const usdToCny = await currentUsdToCny();

  for (let offset = 0; offset < days; offset++) {
    const dayStart = startOfUtcDay(new Date(at.getTime() - offset * 86_400_000));
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const [attributions, commissionRows, distributors] = await Promise.all([
      prisma.orderAttribution.findMany({
        where: {
          distributorId: { not: null },
          natural: false,
          order: {
            paidAt: { gte: dayStart, lt: dayEnd },
            status: { notIn: ["CANCELLED", "REFUNDED"] },
          },
        },
        select: {
          distributorId: true,
          order: { select: { total: true, exchangeRate: true, currency: true } },
        },
      }),
      prisma.commissionLog.groupBy({
        by: ["toUserId"],
        where: { createdAt: { gte: dayStart, lt: dayEnd }, toUserId: { not: null } },
        _sum: { amountCny: true },
      }),
      prisma.distributionRelation.groupBy({
        by: ["ancestorId"],
        where: { depth: { gte: 1 } },
        _count: { _all: true },
      }),
    ]);

    /* 团队口径（P1-3 修复）：一笔归属订单要同时记给「归属分销商本人」**和它的所有上级**。
       原实现只记归属人本人（直属口径），而实时接口 getMyStats 算的是整团队
       （`[self, ...descendants]`）—— 同一张「团队业绩」卡片两个数字，汇总比实时小。
       这里用闭包表把订单上卷到全部上级，与实时口径同源。 */
    const directIds = [...new Set(attributions.map((a) => a.distributorId!))];
    const ancestorRows = directIds.length
      ? await prisma.distributionRelation.findMany({
          where: { descendantId: { in: directIds }, depth: { gte: 1 } },
          select: { ancestorId: true, descendantId: true },
        })
      : [];
    const ancestorsOf = new Map<string, string[]>();
    for (const r of ancestorRows) {
      const list = ancestorsOf.get(r.descendantId) ?? [];
      list.push(r.ancestorId);
      ancestorsOf.set(r.descendantId, list);
    }

    const sales = new Map<string, { orders: number; salesCny: number }>();
    const credit = (id: string, cny: number) => {
      const row = sales.get(id) ?? { orders: 0, salesCny: 0 };
      row.orders += 1;
      row.salesCny = round2(row.salesCny + cny);
      sales.set(id, row);
    };
    for (const a of attributions) {
      const id = a.distributorId!;
      const rate = Number(a.order.exchangeRate ?? 1) || 1;
      /* P1-2 修复：原实现是 `total × exchangeRate`，两处都错 ——
         ① 方向错：exchangeRate 是「1 USD 兑订单币种」，订单币种金额要**除以**它才是 USD；
         ② 漏了 USD→CNY 这一跳，于是 CNY 单被放大成 ~7 倍、USD 单又几乎不动
            （只读 SQL 实测：CNY 402.28 → 2697.17，USD 45 → 45.00 应为 301.71）。
         统一走 toCny()：与计佣、平台报表同一折算函数。 */
      const cny = toCny(Number(a.order.total), a.order.currency, rate, usdToCny);
      credit(id, cny); // 归属人本人
      for (const ancestorId of ancestorsOf.get(id) ?? []) credit(ancestorId, cny); // 各级上级（团队业绩）
    }
    const commission = new Map(
      commissionRows
        .filter((c) => !!c.toUserId)
        .map((c) => [c.toUserId!, round2(Number(c._sum.amountCny ?? 0))]),
    );
    const team = new Map(distributors.map((t) => [t.ancestorId, t._count._all]));

    // 并集：当日有订单 / 有佣金 / 有团队的分销商都要落一行（否则趋势图会缺口）
    const targets = new Set<string>([...sales.keys(), ...commission.keys(), ...team.keys()]);
    if (targets.size === 0) continue;

    /* ⚠️ 必须过滤掉**已不存在的用户**：
       `order_attributions.distributorId` 是当时的归属快照（没有外键，正是为了留痕），
       用户被硬删（GDPR）后这些记录仍在 —— 直接写汇总会撞 `distribution_daily_stats.userId` 外键。
       真实踩过：批量造数 + 删除用户后重跑汇总即报 Foreign key constraint violated。 */
    const alive = await prisma.user.findMany({
      where: { id: { in: [...targets] } },
      select: { id: true },
    });
    const aliveIds = alive.map((u) => u.id);
    if (aliveIds.length === 0) continue;

    await prisma.$transaction(
      aliveIds.map((userId) =>
        prisma.distributionDailyStat.upsert({
          where: { userId_day: { userId, day: dayStart } },
          create: {
            userId,
            day: dayStart,
            orders: sales.get(userId)?.orders ?? 0,
            salesCny: sales.get(userId)?.salesCny ?? 0,
            commissionCny: commission.get(userId) ?? 0,
            teamSize: team.get(userId) ?? 0,
          },
          update: {
            orders: sales.get(userId)?.orders ?? 0,
            salesCny: sales.get(userId)?.salesCny ?? 0,
            commissionCny: commission.get(userId) ?? 0,
            teamSize: team.get(userId) ?? 0,
          },
        }),
      ),
    );
    written += aliveIds.length;
  }

  if (written > 0) logger.info({ days, rows: written }, "分销：团队业绩日汇总已写入");
  return { days, rows: written };
}

/** 读取某分销商最近 N 天的预聚合序列（无数据返回空数组，由调用方决定是否回落实时口径） */
export async function getDailyStatSeries(
  userId: string,
  days: number,
): Promise<{ date: string; orders: number; salesCny: number; commissionCny: number }[]> {
  const since = startOfUtcDay(new Date(Date.now() - (days - 1) * 86_400_000));
  const rows = await prisma.distributionDailyStat.findMany({
    where: { userId, day: { gte: since } },
    orderBy: { day: "asc" },
  });
  return rows.map((r) => ({
    date: r.day.toISOString().slice(0, 10),
    orders: r.orders,
    salesCny: Number(r.salesCny),
    commissionCny: Number(r.commissionCny),
  }));
}
