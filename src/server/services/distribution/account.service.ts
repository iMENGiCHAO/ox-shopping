import "server-only";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyWithdrawStatus } from "./notify.service";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { round2 } from "@/lib/distribution/rules";
import { maskAccountInfo } from "@/lib/distribution/mask";
import { getDistributionConfig } from "./config.service";
import type { DistributionConfig, WithdrawState } from "@/lib/distribution/contract";

/**
 * 分销商账户与提现。
 *
 * 一期口径（已与大爷确认的默认）：**申请 → 平台审核 → 线下打款 → 标记已打款**。
 * 不接自动代付的原因不是技术难度，而是它需要主体资质 + 实名(KYC) + 代扣代缴个税，
 * 这些不是代码能单方面补齐的；`distributor_accounts` 的余额口径先做对，通道可后接。
 *
 * 资金安全设计：
 *   - 申请提现用**条件更新**扣余额（`balance >= amount`），并发提交只会成功一次；
 *   - 同一用户同时只允许一笔在途提现（防"拆单绕过审核"）；
 *   - 驳回/撤销时金额从 frozen 退回 balance，全程有审计。
 */

export interface WithdrawRow {
  id: string;
  amount: number;
  status: string;
  accountInfo: string | null;
  /** KYC：收款人实名与收款方式（线下打款核对用） */
  payeeName: string | null;
  payeeMethod: string | null;
  remark: string | null;
  auditNote: string | null;
  payNote: string | null;
  createdAt: string;
  auditedAt: string | null;
  paidAt: string | null;
  userName?: string;
  userEmail?: string | null;
}

/**
 * 账户一致性对账（P0-6）：校验「物化汇总」与「流水推导值」是否一致，可自动修复。
 *
 * 推导口径（每一条都能独立验证）：
 *   · 累计已结算 = Σ(已结算流水的 amountCny − reversedCny)
 *     —— 结算时入账的是扣除已冲正后的净额，之后的冲正再按增量扣回，
 *        因此「amountCny − reversedCny(当前)」正好等于该流水对账户的净贡献；
 *   · 已打款提现 = Σ(PAID 提现单金额)（资金离开系统）
 *   · 在途冻结   = Σ(PENDING/APPROVED 提现单金额)
 *   · 应有余额   = 累计已结算 − 已打款 − 实际冻结
 *
 * 允许余额为负（退款冲正可能把已入账佣金扣回成负值，属预期挂账）。
 */
export interface AccountDrift {
  userId: string;
  email: string | null;
  actual: { balance: number; frozen: number; totalCommission: number };
  expected: { balance: number; frozen: number; totalCommission: number };
  drift: number;
}

/**
 * 单个用户的「期望账户值」（由流水与提现推导），供快照与修复时重算共用 ——
 * 两处口径必须完全一致，否则修复本身就会制造新的错账。
 */
async function expectedAccountFor(
  client: Pick<typeof prisma, "commissionLog" | "withdrawRecord">,
  userId: string,
): Promise<{ balance: number; frozen: number; totalCommission: number }> {
  const [settled, withdrawals] = await Promise.all([
    client.commissionLog.aggregate({
      where: { toUserId: userId, settledAt: { not: null } },
      _sum: { amountCny: true, reversedCny: true },
    }),
    client.withdrawRecord.groupBy({
      by: ["status"],
      where: { userId },
      _sum: { amount: true },
    }),
  ]);

  // 净额口径：已冲正的部分不算收入（与结算入账口径一致）
  const totalCommission = round2(
    Number(settled._sum.amountCny ?? 0) - Number(settled._sum.reversedCny ?? 0),
  );
  let paid = 0;
  let pending = 0;
  for (const w of withdrawals) {
    const amount = Number(w._sum.amount ?? 0);
    if (w.status === "PAID") paid = round2(paid + amount);
    if (w.status === "PENDING" || w.status === "APPROVED") pending = round2(pending + amount);
  }
  return { balance: round2(totalCommission - paid - pending), frozen: pending, totalCommission };
}

export async function verifyAccountConsistency(options: { apply?: boolean } = {}): Promise<{
  accounts: number;
  drifted: AccountDrift[];
  repaired: number;
}> {
  const [accounts, settled, withdrawals] = await Promise.all([
    prisma.distributorAccount.findMany({
      include: { user: { select: { email: true } } },
    }),
    prisma.commissionLog.groupBy({
      by: ["toUserId"],
      where: { settledAt: { not: null }, toUserId: { not: null } },
      _sum: { amountCny: true, reversedCny: true },
    }),
    prisma.withdrawRecord.groupBy({
      by: ["userId", "status"],
      where: { userId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const settledMap = new Map(
    settled.map((r) => [
      r.toUserId!,
      round2(Number(r._sum.amountCny ?? 0) - Number(r._sum.reversedCny ?? 0)),
    ]),
  );
  const paidMap = new Map<string, number>();
  const pendingMap = new Map<string, number>();
  for (const w of withdrawals) {
    if (!w.userId) continue;
    const amount = Number(w._sum.amount ?? 0);
    if (w.status === "PAID") paidMap.set(w.userId, round2((paidMap.get(w.userId) ?? 0) + amount));
    if (w.status === "PENDING" || w.status === "APPROVED") {
      pendingMap.set(w.userId, round2((pendingMap.get(w.userId) ?? 0) + amount));
    }
  }

  const drifted: AccountDrift[] = [];
  let repaired = 0;

  for (const acc of accounts) {
    const expectedTotal = settledMap.get(acc.userId) ?? 0;
    const expectedFrozen = pendingMap.get(acc.userId) ?? 0;
    const expectedBalance = round2(expectedTotal - (paidMap.get(acc.userId) ?? 0) - expectedFrozen);

    const actual = {
      balance: Number(acc.balance),
      frozen: Number(acc.frozen),
      totalCommission: Number(acc.totalCommission),
    };
    const drift = round2(
      Math.abs(actual.balance - expectedBalance) +
        Math.abs(actual.frozen - expectedFrozen) +
        Math.abs(actual.totalCommission - expectedTotal),
    );
    if (drift <= 0.01) continue;

    drifted.push({
      userId: acc.userId,
      email: acc.user?.email ?? null,
      actual,
      expected: {
        balance: expectedBalance,
        frozen: expectedFrozen,
        totalCommission: expectedTotal,
      },
      drift,
    });

    if (options.apply) {
      /* 事务内行锁 + **重算期望值**（P1 修复）。
         此前直接把上面快照算出的绝对值写回：快照读取与写入之间若有并发
         结算/提现，期间的余额变动会被整体抹掉 —— 典型如用户刚申请提现
         （balance 已扣、frozen 已加），修复按旧快照写回后，用户同时持有
         「冻结额」与「被还原的余额」= 凭空多钱；反向则抹掉刚结算的佣金。
         现在：锁住账户行 → 用同一口径重算最新期望值 → 写回（写值已是最新，
         且锁保证不会有第三方在写入瞬间插入变动）。 */
      const applied = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "userId" FROM "distributor_accounts" WHERE "userId" = ${acc.userId} FOR UPDATE`;
        const fresh = await tx.distributorAccount.findUnique({ where: { userId: acc.userId } });
        if (!fresh) return false;
        const latest = await expectedAccountFor(tx, acc.userId);
        if (
          Number(fresh.balance) === latest.balance &&
          Number(fresh.frozen) === latest.frozen &&
          Number(fresh.totalCommission) === latest.totalCommission
        ) {
          return false; // 重算后已一致（并发已把账抹平），无需再写
        }
        await tx.distributorAccount.update({
          where: { userId: acc.userId },
          data: {
            balance: latest.balance,
            frozen: latest.frozen,
            totalCommission: latest.totalCommission,
          },
        });
        return true;
      });
      if (applied) repaired += 1;
    }
  }

  if (drifted.length > 0) {
    logger.warn(
      { count: drifted.length, repaired, apply: !!options.apply },
      "分销：账户与流水对账发现不一致",
    );
  }
  return { accounts: accounts.length, drifted, repaired };
}

/**
 * 提现风控闸门（P0-5）：日/月累计上限 + 冷却期。
 *
 * 为什么需要：原先只有 `minWithdrawAmount` + 「同时只能有一笔在途」。
 * 账号被盗时，攻击者可以"提一笔 → 等审核通过 → 再提一笔"把余额慢慢搬空，
 * 或者一笔就提走全部余额。加上「单日/单月累计」与「冷却期」后，
 * 即使凭据泄露，损失也被时间窗与额度封顶。
 *
 * 口径：只统计**钱真的出去了或即将出去**的单据（PENDING / APPROVED / PAID）；
 * `REJECTED` 不计入 —— 被驳回的钱没动，不该占用额度。
 * 上限配 0 表示不限（默认给了 5000/50000，见 `DEFAULT_DISTRIBUTION_CONFIG`）。
 */
async function assertWithdrawLimits(
  userId: string,
  amount: number,
  config: DistributionConfig,
): Promise<void> {
  const counted: WithdrawState[] = ["PENDING", "APPROVED", "PAID"];

  if (config.withdrawCooldownHours > 0) {
    const last = await prisma.withdrawRecord.findFirst({
      where: { userId, status: { in: counted } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last) {
      const elapsedHours = (Date.now() - last.createdAt.getTime()) / 3_600_000;
      if (elapsedHours < config.withdrawCooldownHours) {
        const wait = Math.ceil(config.withdrawCooldownHours - elapsedHours);
        throw badRequest(
          `两次提现需间隔 ${config.withdrawCooldownHours} 小时，请 ${wait} 小时后再试`,
        );
      }
    }
  }

  const sumSince = async (from: Date): Promise<number> => {
    const agg = await prisma.withdrawRecord.aggregate({
      where: { userId, status: { in: counted }, createdAt: { gte: from } },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount ?? 0);
  };

  const now = new Date();
  if (config.dailyWithdrawLimit > 0) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const today = await sumSince(dayStart);
    if (today + amount > config.dailyWithdrawLimit) {
      throw badRequest(
        `超出单日提现上限（${config.dailyWithdrawLimit} 元，今日已申请 ${today} 元）`,
      );
    }
  }

  if (config.monthlyWithdrawLimit > 0) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = await sumSince(monthStart);
    if (thisMonth + amount > config.monthlyWithdrawLimit) {
      throw badRequest(
        `超出单月提现上限（${config.monthlyWithdrawLimit} 元，本月已申请 ${thisMonth} 元）`,
      );
    }
  }
}

export async function applyWithdraw(input: {
  userId: string;
  amount: number;
  accountInfo?: string;
  remark?: string;
  payeeName?: string;
  payeeMethod?: "bank" | "alipay" | "wechat" | "other";
  req?: NextRequest;
}): Promise<{ id: string; amount: number }> {
  const config = await getDistributionConfig();
  const amount = round2(Number(input.amount));

  if (!Number.isFinite(amount) || amount <= 0) throw badRequest("提现金额不合法");
  if (amount < config.minWithdrawAmount) {
    throw badRequest(`最低提现金额为 ${config.minWithdrawAmount} 元`);
  }

  // 风控闸门（P0-5）：日/月累计上限 + 冷却期。放在"在途检查"之前 ——
  // 超额/冷却期是更硬的拒绝理由，先给用户最相关的那条提示。
  await assertWithdrawLimits(input.userId, amount, config);

  const inflight = await prisma.withdrawRecord.count({
    where: { userId: input.userId, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (inflight > 0) throw conflict("您已有一笔在途提现申请，请等待处理完成后再提交");

  /* KYC：一期是**线下打款**，必须能核对到人。实名与收款方式首次必填，
     之后可省略并沿用上一次的值（避免每次重复录入）。服务端强校验，不依赖前端。 */
  const lastKyc = await prisma.withdrawRecord.findFirst({
    where: { userId: input.userId, payeeName: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { payeeName: true, payeeMethod: true },
  });
  const payeeName = input.payeeName?.trim() || lastKyc?.payeeName || null;
  const payeeMethod = input.payeeMethod || lastKyc?.payeeMethod || null;
  if (!payeeName) throw badRequest("请填写收款人实名（线下打款需要核对身份）");
  if (!payeeMethod) throw badRequest("请选择收款方式");

  // 《分销规则》确认留痕：提现是产生资金往来的动作，必须留下确认时间
  const account = await prisma.distributorAccount.findUnique({
    where: { userId: input.userId },
    select: { termsAcceptedAt: true },
  });
  if (!account?.termsAcceptedAt) {
    await prisma.distributorAccount.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, termsAcceptedAt: new Date() },
      update: { termsAcceptedAt: new Date() },
    });
  }

  // 邮箱快照：用户注销后仍可追溯打款对象（放在事务外读，只读不参与一致性）
  const userEmail =
    (
      await prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      })
    )?.email ?? null;

  /* 「扣余额」与「建提现单」**必须在同一个事务里**。
     拆成两条独立语句时，中间任何失败（DB 抖动 / 连接断 / 进程被杀）都会造成
     **余额已扣、冻结已加，却没有提现单** —— 用户余额凭空少一笔，客服只能手工查流水补账。
     原子扣减本身仍靠条件更新（`balance: { gte: amount }`）保证不会扣成负数；
     事务只是把"扣款"与"落单"绑成一次要么全成要么全不成的操作。

     并发兜底：上面那次 count 检查与这里的事务之间仍有窄窗口，两个并发请求可能都通过检查。
     数据库侧由**部分唯一索引** `withdraw_records_one_inflight_per_user`
     （见 migration `20260921120000_withdraw_one_inflight_per_user`）保证最终正确性 ——
     撞车时抛 P2002，这里翻译成与前置检查同一句提示，用户看到的是同一回事。 */
  let record: { id: string; amount: unknown };
  try {
    record = await prisma.$transaction(async (tx) => {
      const claimed = await tx.distributorAccount.updateMany({
        where: { userId: input.userId, balance: { gte: amount } },
        data: { balance: { decrement: amount }, frozen: { increment: amount } },
      });
      if (claimed.count === 0) throw badRequest("可提现余额不足");

      return tx.withdrawRecord.create({
        data: {
          userId: input.userId,
          amount,
          accountInfo: input.accountInfo?.trim() || null,
          remark: input.remark?.trim() || null,
          payeeName,
          payeeMethod,
          status: "PENDING",
          userEmail,
        },
        select: { id: true, amount: true },
      });
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw conflict("您已有一笔在途提现申请，请等待处理完成后再提交");
    }
    throw err;
  }

  // 旁路通知（不 await：邮件可能走真实 SMTP）
  void notifyWithdrawStatus({ userId: input.userId, status: "PENDING", amountCny: amount }).catch(
    () => undefined,
  );

  await audit({
    userId: input.userId,
    action: "DISTRIBUTION_WITHDRAW_APPLY",
    entity: "WithdrawRecord",
    entityId: record.id,
    meta: { amount },
    req: input.req,
  });
  logger.info({ userId: input.userId, amount }, "分销：提现申请已提交");

  return { id: record.id, amount: Number(record.amount) };
}

/**
 * 平台侧处理提现：
 *   approve = 审核通过（待打款）
 *   paid    = 已线下打款（从冻结中核销）
 *   reject  = 驳回（金额解冻退回余额）
 */
export async function auditWithdraw(input: {
  id: string;
  action: "approve" | "paid" | "reject";
  actorId: string;
  note?: string;
  payNote?: string;
  req?: NextRequest;
}): Promise<{ status: string }> {
  const record = await prisma.withdrawRecord.findUnique({ where: { id: input.id } });
  if (!record) throw notFound("提现单不存在");

  const amount = Number(record.amount);
  const now = new Date();

  if (input.action === "approve") {
    const claimed = await prisma.withdrawRecord.updateMany({
      where: { id: record.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        auditedById: input.actorId,
        auditedAt: now,
        auditNote: input.note?.trim() || null,
      },
    });
    if (claimed.count === 0) throw conflict("该提现单当前状态不可审核通过");
  } else if (input.action === "paid") {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.withdrawRecord.updateMany({
        where: { id: record.id, status: "APPROVED" },
        data: {
          status: "PAID",
          paidAt: now,
          auditedById: input.actorId,
          payNote: input.payNote?.trim() || null,
        },
      });
      if (claimed.count === 0) throw conflict("该提现单当前状态不可标记为已打款");
      // 申请人已注销（userId=SetNull）时没有账户可动：提现记录本身照常留痕
      if (record.userId) {
        await tx.distributorAccount.updateMany({
          where: { userId: record.userId },
          data: { frozen: { decrement: amount } },
        });
      }
    });
  } else {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.withdrawRecord.updateMany({
        where: { id: record.id, status: { in: ["PENDING", "APPROVED"] } },
        data: {
          status: "REJECTED",
          auditedById: input.actorId,
          auditedAt: now,
          auditNote: input.note?.trim() || null,
        },
      });
      if (claimed.count === 0) throw conflict("该提现单当前状态不可驳回");
      // 解冻退回余额（申请人已注销则跳过账户动作）
      if (record.userId) {
        await tx.distributorAccount.updateMany({
          where: { userId: record.userId },
          data: { frozen: { decrement: amount }, balance: { increment: amount } },
        });
      }
    });
  }

  const fresh = await prisma.withdrawRecord.findUnique({
    where: { id: record.id },
    select: { status: true },
  });

  // 状态变化通知申请人（PENDING→APPROVED/REJECTED/PAID）
  if (record.userId && fresh) {
    void notifyWithdrawStatus({
      userId: record.userId,
      status: fresh.status,
      amountCny: amount,
      note: input.note ?? null,
    }).catch(() => undefined);
  }

  await audit({
    userId: input.actorId,
    action: `DISTRIBUTION_WITHDRAW_${input.action.toUpperCase()}`,
    entity: "WithdrawRecord",
    entityId: record.id,
    meta: { targetUserId: record.userId, amount, note: input.note ?? "" },
    req: input.req,
  });

  return { status: fresh?.status ?? record.status };
}

/** 我的提现记录 */
export async function listMyWithdrawals(
  userId: string,
  opts: { skip: number; take: number },
): Promise<{ rows: WithdrawRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.withdrawRecord.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: opts.skip,
      take: opts.take,
    }),
    prisma.withdrawRecord.count({ where: { userId } }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      status: r.status,
      // 收款账户对本人也只回显尾号：分销后台页面本身可能被旁人看到
      accountInfo: r.accountInfo ? maskAccountInfo(r.accountInfo) : null,
      payeeName: r.payeeName,
      payeeMethod: r.payeeMethod,
      remark: r.remark,
      auditNote: r.auditNote,
      payNote: r.payNote,
      createdAt: r.createdAt.toISOString(),
      auditedAt: r.auditedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
    })),
    total,
  };
}

/** 平台侧提现列表（管理员可见申请人身份与完整信息） */
export async function listWithdrawals(opts: {
  status?: "PENDING" | "APPROVED" | "PAID" | "REJECTED";
  skip: number;
  take: number;
}): Promise<{ rows: WithdrawRow[]; total: number; counts: Record<string, number> }> {
  const where = opts.status ? { status: opts.status } : {};
  const [rows, total, grouped] = await Promise.all([
    prisma.withdrawRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: opts.skip,
      take: opts.take,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.withdrawRecord.count({ where }),
    prisma.withdrawRecord.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, PAID: 0, REJECTED: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      status: r.status,
      accountInfo: r.accountInfo,
      // KYC 打款信息（后台核对用；用户注销后仍有 userEmail 快照可追溯）
      payeeName: r.payeeName,
      payeeMethod: r.payeeMethod,
      userEmail: r.userEmail ?? r.user?.email ?? null,
      remark: r.remark,
      auditNote: r.auditNote,
      payNote: r.payNote,
      createdAt: r.createdAt.toISOString(),
      auditedAt: r.auditedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      userName: r.user?.name ?? "-",
    })),
    total,
    counts,
  };
}
