import "server-only";
import type { NextRequest } from "next/server";
import type { CommissionStatus, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { getRateSnapshot } from "@/components/shop/currency-server";
import {
  COMMISSION_CURRENCY,
  type CommissionRow,
  type CommissionState,
} from "@/lib/distribution/contract";
import {
  planCommissions,
  round2,
  summariseCommission,
  type AncestorNode,
  type CommissionRuleLike,
} from "@/lib/distribution/rules";
import {
  ensureDefaultCommissionRules,
  getActiveCommissionRules,
  getDistributionConfig,
} from "./config.service";
import { getCommissionChain } from "./relation.service";
import { notifyCommissionReversed, notifyCommissionSettled } from "./notify.service";

/**
 * 佣金计提 / 结算 / 冲正。
 *
 * 三条不可动摇的不变量：
 *   ① **只与真实订单挂钩**：每条流水都有 orderId，能一路追到支付与退款；没有任何
 *      「按人头/按注册量」发钱的入口（合规红线，不做成可配置项）；
 *   ② **幂等**：`(orderId, toUserId, level)` 唯一，重复回调/并发补算只会写下一条；
 *   ③ **状态只能单向推进**：PENDING→SETTLED→REVERSED 用条件更新"认领"，
 *      并发结算同一个订单也只有一方能改到余额。
 */

/** 订单处于这些状态才可能产生/保留佣金（已取消的单永远不算） */
const COMMISSIONABLE_ORDER_STATUS: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

/** 金额折算：订单币种 → CNY（账户与提现统一 CNY 记账） */
export function toCny(
  amount: number,
  currency: string,
  exchangeRate: number,
  usdToCny: number,
): number {
  const rate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;
  const usd = currency === "USD" || !currency ? amount : amount / rate;
  return round2(usd * usdToCny);
}

/** 当前 USD→CNY 汇率（读站点汇率快照，含内置兜底，不会因外部接口故障而中断计佣） */
export async function currentUsdToCny(): Promise<number> {
  try {
    const snapshot = await getRateSnapshot();
    const rate = Number(snapshot.rates["CNY"]);
    return Number.isFinite(rate) && rate > 0 ? rate : 7.2;
  } catch {
    return 7.2;
  }
}

/** 计佣基数：商品**实付**小计 = 小计 − 折扣（不含运费与税） */
export function commissionBase(order: { subtotal: unknown; discount: unknown }): number {
  return round2(Number(order.subtotal) - Number(order.discount));
}

/**
 * 解析「归属关系链快照」为分佣链。
 *
 * 结构：`[{ userId, depth, tier }]`，depth 从 1 开始（1 = 归属分销商本人）——
 * 与 `getCommissionChain()` 的返回同构，因为快照正是它在下单归属时写下的。
 * 任一项结构不合法即返回 null（宁可兜底实时链，也不拿半截数据算钱）。
 */
function parseRelationPathSnapshot(raw: unknown): AncestorNode[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: AncestorNode[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const { userId, depth, tier } = item as { userId?: unknown; depth?: unknown; tier?: unknown };
    if (typeof userId !== "string" || typeof depth !== "number") return null;
    out.push({ userId, depth, tier: typeof tier === "number" ? tier : 0 });
  }
  return out;
}

/**
 * 为订单计提佣金（幂等，可反复调用）。
 * 订单未支付 / 自然流量订单 / 基数≤0 / 已计提过 → 静默跳过并返回原因。
 */
export async function accrueForOrder(
  orderId: string,
  req?: NextRequest,
): Promise<{ count: number; skipped?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      userId: true,
      subtotal: true,
      discount: true,
      currency: true,
      exchangeRate: true,
    },
  });
  if (!order) return { count: 0, skipped: "ORDER_NOT_FOUND" };
  if (!COMMISSIONABLE_ORDER_STATUS.includes(order.status)) {
    return { count: 0, skipped: "NOT_PAID" };
  }

  const attribution = await prisma.orderAttribution.findUnique({
    where: { orderId },
    select: { distributorId: true, natural: true, relationPathSnapshot: true },
  });
  if (!attribution?.distributorId) return { count: 0, skipped: "NATURAL" };

  const already = await prisma.commissionLog.count({ where: { orderId } });
  if (already > 0) return { count: 0, skipped: "ALREADY_ACCRUED" };

  const baseAmount = commissionBase(order);
  if (baseAmount <= 0) return { count: 0, skipped: "ZERO_BASE" };

  const config = await getDistributionConfig();
  // 规则表为空时先补齐默认三级规则。
  //
  // 为什么必须放在**计佣路径**里，而不是只放在后台规则页：
  // 规则若只在「后台打开规则页」时惰性写入，则只要没人点过那个页面，
  // `resolveRatio` 对所有层级都返回 0 → **佣金静默算成 0**，而订单/页面/接口全部正常。
  // 集成测试正是这样抓到它的。宁可每次计佣多一次 count 查询（有索引，代价极小）。
  await ensureDefaultCommissionRules();

  /* 分佣链走「归属快照优先」（快照口径）：
     · 分销通行口径是「订单归属在谁的链上，就按那一时刻的链分佣」＝首次绑定定终身；
     · 等级同样取快照里的 tier（归属时刻的等级），与「等级只影响之后的订单」一致。
     此前这里直接用 `getCommissionChain()` 取**当时活链 + 当时等级** —— 于是订单支付
     与计提之间若发生换绑/闭包重建（对账补算可延迟数天），该订单会按新链分佣，
     与 `relationPathSnapshot` 的语义承诺相矛盾。快照缺失（历史订单/异常数据）时
     兜底实时链，并在下方立即补写快照以保证后续口径稳定。 */
  const rawSnapshot = parseRelationPathSnapshot(attribution.relationPathSnapshot);
  /* 快照是**历史数据**：链上的人可能已注销/被删除（User onDelete 级联清理关系表，
     但快照是 JSON 快照，不会跟着变）。若把幽灵 userId 直接拿去建佣金流水，
     会因外键约束让**整笔计佣失败**（一个失效节点拖垮整单佣金）。
     因此先做一次存在性过滤；过滤后为空则视为无快照，回落实时链。 */
  let snapshotChain = rawSnapshot;
  if (rawSnapshot) {
    const alive = await prisma.user.findMany({
      where: { id: { in: rawSnapshot.map((c) => c.userId) } },
      select: { id: true },
    });
    const aliveIds = new Set(alive.map((u) => u.id));
    const pruned = rawSnapshot.filter((c) => aliveIds.has(c.userId));
    snapshotChain = pruned.length > 0 ? pruned : null;
  }

  const [chain, rules, items] = await Promise.all([
    snapshotChain ?? getCommissionChain(attribution.distributorId),
    // P2-13：走缓存版（每笔支付订单都要读规则；后台改规则时精准失效）
    getActiveCommissionRules(),
    prisma.orderItem.findMany({
      where: { orderId },
      select: { productId: true, product: { select: { categoryId: true } } },
    }),
  ]);

  const productIds = [...new Set(items.map((i) => i.productId).filter((v): v is string => !!v))];
  const categoryIds = [
    ...new Set(items.map((i) => i.product?.categoryId).filter((v): v is string => !!v)),
  ];

  // 历史订单无快照：本次采用实时链后立刻固化，避免同一订单下次口径漂移
  if (!snapshotChain) {
    await prisma.orderAttribution
      .update({
        where: { orderId },
        data: { relationPathSnapshot: chain as unknown as Prisma.InputJsonValue },
      })
      .catch((err) => {
        logger.warn({ err, orderId }, "分销：补写归属快照失败（不影响本次计佣）");
      });
  }

  const planned = planCommissions({
    baseAmount,
    ancestors: chain,
    rules: rules.map((r) => ({ ...r, ratio: Number(r.ratio) })) as CommissionRuleLike[],
    config,
    buyerId: order.userId,
    productIds,
    categoryIds,
  });
  if (planned.length === 0) return { count: 0, skipped: "NO_PLAN" };

  const usdToCny = await currentUsdToCny();
  const exchangeRate = Number(order.exchangeRate);
  const rows = planned.map((p) => ({
    orderId,
    fromUserId: order.userId,
    toUserId: p.userId,
    level: p.level,
    ratio: p.ratio,
    amount: p.amount,
    amountCny: toCny(p.amount, order.currency, exchangeRate, usdToCny),
    currency: order.currency,
    baseAmount,
    status: "PENDING" as const,
  }));

  // 受益人快照：用户注销/删除后（toUserId 置 NULL）仍能对账与客服追溯
  const payees = await prisma.user.findMany({
    where: { id: { in: planned.map((p) => p.userId) } },
    select: { id: true, name: true, email: true },
  });
  const payeeMap = new Map(payees.map((u) => [u.id, u]));
  const rowsWithSnapshot = rows.map((r) => ({
    ...r,
    toUserName: payeeMap.get(r.toUserId)?.name ?? null,
    toUserEmail: payeeMap.get(r.toUserId)?.email ?? null,
  }));

  const res = await prisma.commissionLog.createMany({
    data: rowsWithSnapshot,
    skipDuplicates: true,
  });
  if (res.count > 0) {
    await audit({
      action: "DISTRIBUTION_COMMISSION_ACCRUE",
      entity: "Order",
      entityId: orderId,
      meta: {
        orderNumber: order.orderNumber,
        baseAmount,
        currency: order.currency,
        levels: planned.map((p) => p.level),
        count: res.count,
      },
      req,
    });
    logger.info(
      { orderId, count: res.count, baseAmount, currency: order.currency },
      "分销：佣金已计提",
    );
  }
  return { count: res.count };
}

/**
 * `FOR UPDATE` 锁定后的流水行 —— 字段值取自**事务内**的库内最新值。
 *
 * 为什么需要：结算与冲正是同一行流水的两条并发写入路径。若像此前那样在
 * 事务外读快照、再在事务内按快照算钱/回写 status，会出现
 * ①按旧净额入账（多给钱）②把已结算流水回写成 PENDING 后再次入账（双重入账）
 * ③用旧 settledAt 判断「未结算」而漏扣余额。三条路径统一改为锁内读数。
 */
interface LockedCommissionRow {
  id: string;
  orderId?: string;
  toUserId: string | null;
  amount: unknown;
  amountCny: unknown;
  reversedAmount: unknown;
  reversedCny: unknown;
  settledAt: Date | null;
  status: CommissionStatus;
  reversedAt: Date | null;
}

/**
 * 结算某订单的佣金（PENDING → SETTLED），并累加可提现余额。
 *
 * 并发口径（P0 修复）：净额与认领都在**同一事务内**、对流水行加 `FOR UPDATE`
 * 行锁后读取，与冲正路径串行化 —— 此前净额取自事务外快照，并发冲正时
 * 会出现少扣余额与双重入账。
 */
export async function settleOrder(orderId: string, req?: NextRequest): Promise<number> {
  let settled = 0;
  await prisma.$transaction(async (tx) => {
    // 锁行后读库内当前值：净额必须以「此刻的已冲正额」为准
    const logs = await tx.$queryRaw<LockedCommissionRow[]>`
      SELECT id, "toUserId", "amountCny", "reversedCny"
      FROM "commission_logs"
      WHERE "orderId" = ${orderId} AND status = 'PENDING'
      FOR UPDATE
    `;

    for (const log of logs) {
      // 入账「净额」：已经按比例冲正掉的部分不进余额（部分退款的正确口径）
      const net = round2(Number(log.amountCny) - Number(log.reversedCny));
      if (net <= 0) {
        await tx.commissionLog.updateMany({
          where: { id: log.id, status: "PENDING" },
          data: { status: "REVERSED", reversedAt: new Date(), note: "结算时已全额冲正" },
        });
        settled += 1;
        continue;
      }
      const claimed = await tx.commissionLog.updateMany({
        where: { id: log.id, status: "PENDING" },
        data: { status: "SETTLED", settledAt: new Date() },
      });
      if (claimed.count === 0) continue; // 已被并发处理
      // 受益人已注销（toUserId 为 NULL）：流水照常推进，只是没有账户可入账
      if (!log.toUserId) {
        settled += 1;
        continue;
      }
      await tx.distributorAccount.upsert({
        where: { userId: log.toUserId },
        create: { userId: log.toUserId, balance: net, totalCommission: net },
        update: { balance: { increment: net }, totalCommission: { increment: net } },
      });
      settled += 1;
    }
  });

  if (settled > 0) {
    /* 通知是**旁路**：任何失败只记日志，绝不回滚已落库的入账。
       逐人汇总净额（同一订单可能有多级受益人）。 */
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true },
      });
      const credited = await prisma.commissionLog.findMany({
        where: { orderId, settledAt: { not: null } },
        select: { toUserId: true, amountCny: true, reversedCny: true },
      });
      const byUser = new Map<string, number>();
      for (const log of credited) {
        if (!log.toUserId) continue;
        const net = round2(Number(log.amountCny) - Number(log.reversedCny));
        if (net <= 0) continue;
        byUser.set(log.toUserId, round2((byUser.get(log.toUserId) ?? 0) + net));
      }
      // 刻意不 await：邮件可能走真实 SMTP（秒级~分钟级），绝不能拖慢结算与 API 响应
      void Promise.all(
        [...byUser.entries()].map(([userId, amountCny]) =>
          notifyCommissionSettled({ userId, amountCny, orderNumber: order?.orderNumber }).catch(
            (err) => logger.error({ err, userId }, "分销：结算通知失败（已忽略）"),
          ),
        ),
      );
    } catch (err) {
      logger.error({ err, orderId }, "分销：结算通知发送失败（已忽略）");
    }

    await audit({
      action: "DISTRIBUTION_COMMISSION_SETTLE",
      entity: "Order",
      entityId: orderId,
      meta: { count: settled },
      req,
    });
  }
  return settled;
}

/**
 * 计算某订单当前的**累计退款比例**（0~1）。
 *
 * 口径：
 *   · 订单已整单退款/取消 → 1；
 *   · 否则取「已完成的退款单（status=REFUNDED）金额之和 / 订单应付金额」；
 *   · 无退款 → 0。
 *
 * 为什么按比例而不是"一退就全冲"：部分退款后订单仍是 PAID，
 * 只按整单标记判断会**少冲**（给已退款的部分白付佣金）。
 */
export async function reversalRatioForOrder(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    // ⚠️ 必须取 subtotal/discount：冲正比例的分母要与**计提基数**同源
    select: { status: true, total: true, subtotal: true, discount: true },
  });
  if (!order) return 0;
  if (order.status === "REFUNDED" || order.status === "CANCELLED") return 1;

  const agg = await prisma.refund.aggregate({
    where: { orderId, status: "REFUNDED" },
    _sum: { amount: true },
  });
  const refunded = Number(agg._sum.amount ?? 0);
  if (refunded <= 0) return 0;

  /* 分母口径（P1-1 修复）：**商品实付小计**（subtotal − discount），与 commissionBase() 同源。
     原实现用 order.total 作分母：佣金既然按「商品实付」计提，就必须按「商品实付」冲正。
     含运费订单（实测 87/96 张）商品全额退款时 refunded/total = 90/100 = 0.9，
     只冲回 90% 佣金 —— 平台在已退款的商品上白付 10%~25% 的佣金。
     退款额可能含运费（整单退），此时比值 >1 → 夹取到 1（全额冲正）。 */
  const base = commissionBase(order);
  if (base <= 0) return 1;
  return Math.min(1, refunded / base);
}

/**
 * 按比例冲正某订单的佣金（**增量 + 幂等**）。
 *
 * 设计要点：
 *   1. 流水上记「累计已冲正金额」（reversedAmount/reversedCny），
 *      本次只处理 `目标额 − 已冲正额` 的增量 → 反复调用（退款流程 + 每分钟对账）不会重复扣；
 *   2. 已结算的部分才扣余额（钱已经进过账户），PENDING 的部分改为"结算时按净额入账"；
 *   3. 用 `reversedCny/reversedAmount` 作 CAS 条件更新，并发下只有一方能推进（不会双扣）；
 *   4. 受益人已注销（toUserId=NULL）时流水照常推进，只是没有账户可扣。
 */
export async function applyOrderReversal(
  orderId: string,
  ratio: number,
  note = "订单退款/取消冲正",
  req?: NextRequest,
): Promise<number> {
  if (!(ratio > 0)) return 0;

  let touched = 0;
  /** 事务内累积「谁被扣了多少」——通知在事务外发送，避免邮件拖长持锁时间 */
  const reversedByUser = new Map<string, number>();

  await prisma.$transaction(async (tx) => {
    // 行锁 + 库内当前值（P0 修复）：增量、「是否已结算」、回写 status 全部取
    // 锁内值。此前读事务外快照后回写 `log.status`，会把并发结算过的流水重新
    // 写成 PENDING（下一轮再次入账 = 双重入账），并用旧 settledAt 漏扣余额。
    const logs = await tx.$queryRaw<LockedCommissionRow[]>`
      SELECT id, "toUserId", amount, "amountCny", "reversedAmount", "reversedCny", "settledAt", status, "reversedAt"
      FROM "commission_logs"
      WHERE "orderId" = ${orderId} AND status <> 'REVERSED'
      FOR UPDATE
    `;

    for (const log of logs) {
      const amount = Number(log.amount);
      const amountCny = Number(log.amountCny);
      const targetAmount = round2(amount * ratio);
      const targetCny = round2(amountCny * ratio);
      const deltaAmount = round2(targetAmount - Number(log.reversedAmount));
      const deltaCny = round2(targetCny - Number(log.reversedCny));
      if (deltaAmount <= 0 && deltaCny <= 0) continue; // 已冲正到位（幂等）

      const full = targetAmount >= round2(amount) - 0.005;
      // 行已被 FOR UPDATE 锁到本事务提交：无需再比对 CAS 条件，也不会丢更新
      await tx.commissionLog.update({
        where: { id: log.id },
        data: {
          reversedAmount: targetAmount,
          reversedCny: targetCny,
          status: full ? "REVERSED" : log.status,
          reversedAt: full ? new Date() : log.reversedAt,
          note,
        },
      });

      // 已入账的部分要按增量扣回（余额可为负 → 挂账，由后续佣金抵扣）
      if (log.settledAt && deltaCny > 0 && log.toUserId) {
        await tx.distributorAccount.upsert({
          where: { userId: log.toUserId },
          create: { userId: log.toUserId, balance: -deltaCny, totalCommission: -deltaCny },
          update: {
            balance: { decrement: deltaCny },
            totalCommission: { decrement: deltaCny },
          },
        });
        reversedByUser.set(
          log.toUserId,
          round2((reversedByUser.get(log.toUserId) ?? 0) + deltaCny),
        );
      }
      touched += 1;
    }
  });

  if (touched > 0) {
    /* 旁路通知：谁被冲正了多少。刻意不 await —— 退款审批接口不能因为发邮件变慢。 */
    try {
      if (reversedByUser.size > 0) {
        const orderRow = await prisma.order.findUnique({
          where: { id: orderId },
          select: { orderNumber: true },
        });
        void Promise.all(
          [...reversedByUser.entries()].map(([userId, amountCny]) =>
            notifyCommissionReversed({
              userId,
              amountCny,
              orderNumber: orderRow?.orderNumber,
              full: ratio >= 1,
            }).catch((err) => logger.error({ err, userId }, "分销：冲正通知失败（已忽略）")),
          ),
        );
      }
    } catch (err) {
      logger.error({ err, orderId }, "分销：冲正通知组装失败（已忽略）");
    }

    await audit({
      action: "DISTRIBUTION_COMMISSION_REVERSE",
      entity: "Order",
      entityId: orderId,
      meta: { ratio, count: touched, note },
      req,
    });
    logger.info({ orderId, ratio, count: touched }, "分销：佣金已按比例冲正");
  }
  return touched;
}

/**
 * 冲正入口（供 bridge 与对账共用）：先算当前应冲正比例，再增量冲正。
 * 幂等，可安全地在「退款成功」「订单改状态」「每分钟对账」多处重复调用。
 */
export async function syncOrderReversal(
  orderId: string,
  note = "订单退款/取消冲正",
  req?: NextRequest,
): Promise<number> {
  const ratio = await reversalRatioForOrder(orderId);
  if (ratio <= 0) return 0;
  return applyOrderReversal(orderId, ratio, note, req);
}

/**
 * 持有期到期自动结算（调度器调用）：支付满 `settleHoldDays` 天且未退款。
 * 确认收货会立即结算（不等持有期），这里是兜底。
 */
export async function settleDueOrders(limit = 200): Promise<{ orders: number; settled: number }> {
  const config = await getDistributionConfig();
  const cutoff = new Date(Date.now() - config.settleHoldDays * 86_400_000);

  const rows = await prisma.commissionLog.findMany({
    where: {
      status: "PENDING",
      order: {
        paidAt: { not: null, lte: cutoff },
        status: { in: COMMISSIONABLE_ORDER_STATUS },
      },
    },
    select: { orderId: true },
    distinct: ["orderId"],
    take: limit,
  });

  let settled = 0;
  for (const row of rows) {
    settled += await settleOrder(row.orderId);
  }
  return { orders: rows.length, settled };
}

/** 我的佣金明细（行级权限：只查自己的） */
export async function listMyCommissions(
  userId: string,
  opts: { skip: number; take: number; status?: CommissionState },
): Promise<{ rows: CommissionRow[]; total: number }> {
  const where = { toUserId: userId, ...(opts.status ? { status: opts.status } : {}) };
  const [logs, total] = await Promise.all([
    prisma.commissionLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: opts.skip,
      take: opts.take,
      include: { order: { select: { orderNumber: true, total: true, currency: true } } },
    }),
    prisma.commissionLog.count({ where }),
  ]);

  return {
    rows: logs.map((l) => ({
      id: l.id,
      orderNumber: l.order?.orderNumber ?? "-",
      orderAmount: String(l.order?.total ?? "0"),
      currency: l.order?.currency ?? l.currency,
      level: l.level,
      ratio: Number(l.ratio),
      amount: Number(l.amount),
      amountCny: Number(l.amountCny),
      status: l.status as CommissionState,
      createdAt: l.createdAt.toISOString(),
      settledAt: l.settledAt?.toISOString() ?? null,
    })),
    total,
  };
}

/** 账户摘要：可提现 / 冻结 / 累计已结算 / 在途 */
export async function getAccountSummary(userId: string): Promise<{
  termsAccepted: boolean;
  termsAcceptedAt: string | null;
  balance: number;
  frozen: number;
  totalCommission: number;
  pendingCommission: number;
  settledCommission: number;
}> {
  const [account, grouped, pendingAgg] = await Promise.all([
    prisma.distributorAccount.findUnique({ where: { userId } }),
    // 聚合必须带 reversedCny：部分退款后流水仍是 PENDING/SETTLED，
    // 只看 amountCny 会把已冲正的部分也算成收入（与 balance 口径矛盾）。
    prisma.commissionLog.groupBy({
      by: ["status"],
      where: { toUserId: userId },
      _sum: { amountCny: true, reversedCny: true },
    }),
    prisma.commissionLog.aggregate({
      where: { toUserId: userId, status: "PENDING" },
      _sum: { amountCny: true, reversedCny: true },
    }),
  ]);

  const sums = summariseCommission(
    grouped.map((g) => ({
      status: g.status,
      amountCny: Number(g._sum.amountCny ?? 0),
      reversedCny: Number(g._sum.reversedCny ?? 0),
    })),
  );

  return {
    termsAccepted: !!account?.termsAcceptedAt,
    termsAcceptedAt: account?.termsAcceptedAt ? account.termsAcceptedAt.toISOString() : null,
    balance: Number(account?.balance ?? 0),
    frozen: Number(account?.frozen ?? 0),
    totalCommission: Number(account?.totalCommission ?? sums.settled),
    // 在途同样是净额：扣除该 PENDING 行已按比例冲正掉的部分
    pendingCommission: round2(
      Math.max(
        0,
        Number(pendingAgg._sum.amountCny ?? 0) - Number(pendingAgg._sum.reversedCny ?? 0),
      ),
    ),
    settledCommission: sums.settled,
  };
}

export { COMMISSION_CURRENCY };

/**
 * 管理端**手动冲正**单条佣金（P1-8）。
 *
 * 为什么需要：自动冲正只认「订单退款/取消」这一条路径，但真实运营里还有
 * 刷单认定、客服赔付、错单纠正等场景 —— 这些必须能人工定点冲掉，且**留痕可查**。
 *
 * 与自动冲正共用同一套账本口径：
 *   · 只推进 `reversedAmount/reversedCny` 的增量（传 amount=null 表示全额冲正）；
 *   · 已入账（settledAt 非空）的部分按增量从余额扣回，可为负（挂账）；
 *   · CAS 条件更新 + 状态推进，幂等、并发安全；
 *   · 受益人已注销（toUserId=NULL）时只改流水、不动账户。
 */
export async function reverseCommissionManually(input: {
  logId: string;
  /** 冲正金额（订单币种）；不传=全额冲正 */
  amount?: number | null;
  note: string;
  actorId: string;
  req?: NextRequest;
}): Promise<{ orderId: string; reversedAmount: number; fullReversed: boolean }> {
  // 用容器对象收集事务结果：TS 不把闭包内对 let 变量的赋值纳入控制流分析，
  // 直接读 let 会被收窄成 never；属性读写没有这个问题。
  const box: {
    value: {
      orderId: string;
      reversedAmount: number;
      fullReversed: boolean;
      toUserId: string | null;
      deltaCny: number;
    } | null;
  } = { value: null };

  await prisma.$transaction(async (tx) => {
    // 行锁 + 库内当前值（P0 修复）：与 settleOrder / applyOrderReversal 串行化。
    // 此前读事务外快照后回写 `log.status`，会把并发结算过的流水写成 PENDING
    // （下一轮结算再次入账 = 双重入账），并用旧 settledAt 漏扣余额。
    const rows = await tx.$queryRaw<LockedCommissionRow[]>`
      SELECT id, "orderId", "toUserId", amount, "amountCny", "reversedAmount", "reversedCny", "settledAt", status, "reversedAt"
      FROM "commission_logs"
      WHERE id = ${input.logId}
      FOR UPDATE
    `;
    const log = rows[0];
    if (!log) throw notFound("佣金流水不存在");
    if (log.status === "REVERSED") throw conflict("该笔佣金已全额冲正，无需重复操作");

    const amount = Number(log.amount);
    const amountCny = Number(log.amountCny);
    const alreadyAmount = Number(log.reversedAmount);
    const alreadyCny = Number(log.reversedCny);
    if (amount <= 0) throw badRequest("该笔佣金金额异常，无法冲正");

    const targetAmount =
      input.amount == null ? amount : round2(Math.min(Number(input.amount), amount));
    if (!(targetAmount > 0)) throw badRequest("冲正金额必须大于 0");
    if (targetAmount <= alreadyAmount) {
      throw conflict(`冲正金额不得超过未冲正余额（当前可冲正 ${round2(amount - alreadyAmount)}）`);
    }

    // 金额与人民币按同一比例推进，保证折算口径一致
    const ratio = targetAmount / amount;
    const targetCny = round2(amountCny * ratio);
    const deltaCny = round2(targetCny - alreadyCny);
    const fullReversed = targetAmount >= round2(amount) - 0.005;

    // 行已被 FOR UPDATE 锁定，无需 CAS 比对（也不会丢更新）
    await tx.commissionLog.update({
      where: { id: log.id },
      data: {
        reversedAmount: targetAmount,
        reversedCny: targetCny,
        status: fullReversed ? "REVERSED" : log.status,
        reversedAt: fullReversed ? new Date() : log.reversedAt,
        note: `人工冲正：${input.note}`,
      },
    });

    if (log.settledAt && deltaCny > 0 && log.toUserId) {
      await tx.distributorAccount.upsert({
        where: { userId: log.toUserId },
        create: { userId: log.toUserId, balance: -deltaCny, totalCommission: -deltaCny },
        update: { balance: { decrement: deltaCny }, totalCommission: { decrement: deltaCny } },
      });
    }

    box.value = {
      orderId: log.orderId ?? "",
      reversedAmount: targetAmount,
      fullReversed,
      toUserId: log.toUserId,
      deltaCny,
    };
  });

  if (!box.value) throw new Error("人工冲正未产生结果（事务应在失败时抛出）");
  const result = box.value;

  if (result.toUserId) {
    void notifyCommissionReversed({
      userId: result.toUserId,
      amountCny: result.deltaCny,
      full: result.fullReversed,
    }).catch((err) => logger.error({ err }, "分销：人工冲正通知失败（已忽略）"));
  }

  await audit({
    userId: input.actorId,
    action: "DISTRIBUTION_COMMISSION_MANUAL_REVERSE",
    entity: "CommissionLog",
    entityId: input.logId,
    meta: {
      orderId: result.orderId,
      amount: result.reversedAmount,
      fullReversed: result.fullReversed,
      note: input.note,
    },
    req: input.req,
  });
  logger.warn(
    {
      logId: input.logId,
      orderId: result.orderId,
      targetAmount: result.reversedAmount,
      actorId: input.actorId,
    },
    "分销：管理端人工冲正佣金",
  );

  return {
    orderId: result.orderId,
    reversedAmount: result.reversedAmount,
    fullReversed: result.fullReversed,
  };
}
