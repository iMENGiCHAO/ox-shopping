import "server-only";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyWithdrawStatus } from "./notify.service";
import { logger } from "@/lib/logger";
import { captureMessage } from "@/lib/monitoring";
import { audit } from "@/lib/audit";
import { notifyAdmins } from "@/server/services/notification.service";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { round2 } from "@/lib/distribution/rules";
import { maskAccountInfo } from "@/lib/distribution/mask";
import { getDistributionConfig } from "./config.service";
import { currentUsdToCny } from "./commission.service";
import { FALLBACK_RATES } from "@/components/shop/currency";
import { getRateSnapshot } from "@/components/shop/currency-server";
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
  /** 提现币种（账户结算币种的申请时快照；金额按此币种计价） */
  currency: string;
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
 * 推导口径（每一条都能独立验证，金额均为**账户结算币种**）：
 *   · 累计已结算 = Σ(已结算流水的 amountSettle − reversedSettle)
 *     —— 结算时入账的是扣除已冲正后的净额，之后的冲正再按增量扣回，
 *        因此「amountSettle − reversedSettle(当前)」正好等于该流水对账户的净贡献；
 *   · 已打款提现 = Σ(PAID 提现单金额)（资金离开系统）
 *   · 在途冻结   = Σ(PENDING/APPROVED 提现单金额)
 *   · 应有余额   = 累计已结算 − 已打款 − 实际冻结
 *
 * 前提：同一账户的所有流水 settleCurrency 与账户 settlementCurrency 一致 ——
 * 由 setSettlementCurrency 的「零余额才可改」约束保证。
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
      _sum: { amountSettle: true, reversedSettle: true },
    }),
    client.withdrawRecord.groupBy({
      by: ["status"],
      where: { userId },
      _sum: { amount: true },
    }),
  ]);

  // 净额口径：已冲正的部分不算收入（与结算入账口径一致；金额=账户结算币种）
  const totalCommission = round2(
    Number(settled._sum.amountSettle ?? 0) - Number(settled._sum.reversedSettle ?? 0),
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
  /** 流水币种与账户币种不一致的历史竞态残留（只能人工裁决，不自动修） */
  currencyMismatches: { userId: string; accountCurrency: string; logCurrency: string; logs: number }[];
}> {
  const [accounts, settled, withdrawals] = await Promise.all([
    prisma.distributorAccount.findMany({
      include: { user: { select: { email: true } } },
    }),
    prisma.commissionLog.groupBy({
      by: ["toUserId"],
      where: { settledAt: { not: null }, toUserId: { not: null } },
      _sum: { amountSettle: true, reversedSettle: true },
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
      round2(Number(r._sum.amountSettle ?? 0) - Number(r._sum.reversedSettle ?? 0)),
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

  // 商用审计修复（高危）：币种漂移独立检测 —— 结算币种变更竞态的历史残留
  // 会把「CNY 面额」的流水记在外币账户上，**数字校验完全失明**（72 CNY 与
  // 72 EUR 数字一致）。这里扫「流水 settleCurrency ≠ 账户 settlementCurrency」，
  // 命中即单独上报（不入 apply 自动修复名单 —— 币种错配只能人工裁决，自动改
  // 数字反而会把错账「坐实」）。
  const accountCurrencyOf = new Map(accounts.map((a) => [a.userId, a.settlementCurrency]));
  const currencyMismatches: {
    userId: string;
    accountCurrency: string;
    logCurrency: string;
    logs: number;
  }[] = [];
  const mismatchGroups = await prisma.commissionLog.groupBy({
    by: ["toUserId", "settleCurrency"],
    where: {
      toUserId: { in: accounts.map((a) => a.userId) },
      status: { in: ["PENDING", "SETTLED"] },
    },
    _count: { _all: true },
  });
  for (const g of mismatchGroups) {
    if (!g.toUserId) continue;
    const accountCurrency = accountCurrencyOf.get(g.toUserId);
    if (accountCurrency && g.settleCurrency !== accountCurrency) {
      currencyMismatches.push({
        userId: g.toUserId,
        accountCurrency,
        logCurrency: g.settleCurrency,
        logs: g._count._all,
      });
    }
  }
  if (currencyMismatches.length > 0) {
    captureMessage(
      `[distribution] 发现 ${currencyMismatches.length} 个账户存在结算币种错配（流水币种≠账户币种），需人工裁决`,
      "error",
    );
  }

  if (drifted.length > 0) {
    logger.warn(
      { count: drifted.length, repaired, apply: !!options.apply },
      "分销：账户与流水对账发现不一致",
    );
    captureMessage(
      `[distribution] 账户对账发现 ${drifted.length} 处不一致（修复模式=${options.apply ? "apply" : "dry-run"}），请管理员核查`,
      "warning",
    );
  }
  return { accounts: accounts.length, drifted, repaired, currencyMismatches };
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
  settlementCurrency: string,
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
          `Withdrawals must be at least ${config.withdrawCooldownHours} hours apart; please retry in ${wait} hour(s)`,
        );
      }
    }
  }

  /* 额度折算（2026-09-24 多币种结算）：限额在后台按 CNY 心智配置（如日限 5000），
     非人民币结算账户的提现金额需要折成 CNY 后再与限额比较 —— 否则 USD 账户
     提 5000 USD ≈ 3.6 万人民币，风控形同虚设。汇率取当前站点快照（近似即可：
     限额是风控粗粒度闸门，不要求分毫精确）。 */
  const cnyPerUnit = await cnyRateFor(settlementCurrency);
  const amountCny = round2(amount * cnyPerUnit);

  const sumSince = async (from: Date): Promise<number> => {
    const agg = await prisma.withdrawRecord.aggregate({
      where: { userId, status: { in: counted }, createdAt: { gte: from } },
      _sum: { amount: true },
    });
    // 历史提现与本次申请同为账户结算币种（币种锁定约束），同乘一个汇率即可
    return round2(Number(agg._sum.amount ?? 0) * cnyPerUnit);
  };

  const now = new Date();
  if (config.dailyWithdrawLimit > 0) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const today = await sumSince(dayStart);
    if (today + amountCny > config.dailyWithdrawLimit) {
      throw badRequest(
        `Daily withdrawal limit exceeded (limit ${config.dailyWithdrawLimit} CNY-equivalent, applied today ${round2(today)})`,
      );
    }
  }

  if (config.monthlyWithdrawLimit > 0) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = await sumSince(monthStart);
    if (thisMonth + amountCny > config.monthlyWithdrawLimit) {
      throw badRequest(
        `Monthly withdrawal limit exceeded (limit ${config.monthlyWithdrawLimit} CNY-equivalent, applied this month ${round2(thisMonth)})`,
      );
    }
  }
}

/** 结算币种 → CNY 的换算率（1 单位该币种 = X CNY）。取当前站点汇率快照。 */
async function cnyRateFor(currency: string): Promise<number> {
  const code = currency.toUpperCase();
  if (code === "CNY") return 1;
  try {
    const [rates, usdToCny] = await Promise.all([getRateSnapshot(), currentUsdToCny()]);
    const perUsd = Number(rates.rates[code]);
    if (Number.isFinite(perUsd) && perUsd > 0) return usdToCny / perUsd;
  } catch {
    /* 快照不可用：落入下方内置参考兜底 */
  }
  // 商用审计修复：绝不静默按 1 兜底 —— USD 账户的「日限 5000 CNY」会被
  // 实际放行成 5000 USD（≈¥3.6 万，风控限额放大 ~7 倍）。快照不可用时退
  // 内置参考汇率（近似但方向保守）；参考表也没有该币种（白名单外的伪代码）
  // 则直接拒绝提现 —— 风控宁严勿松。
  const fallbackPerUsd = Number(FALLBACK_RATES[code]);
  const fallbackCny = Number(FALLBACK_RATES.CNY);
  if (
    Number.isFinite(fallbackPerUsd) &&
    fallbackPerUsd > 0 &&
    Number.isFinite(fallbackCny) &&
    fallbackCny > 0
  ) {
    return fallbackCny / fallbackPerUsd;
  }
  throw badRequest(
    // 顾客可见文案走英文源串（英文站默认语言），中文由 lib/error-i18n.ts 按请求语言替换
    `Settlement currency ${code} rate unavailable — cannot calculate the withdrawal limit right now, please try again later or contact support`,
  );
}

/**
 * 把「CNY 口径的配置数字」换算成某账户结算币种下的等值数字（如最低提现额）。
 * 给 API 层做展示换算用 —— 服务端与前端展示共用同一口径，不各算一套。
 */
export async function cnyRateForAccount(currency: string): Promise<number> {
  return cnyRateFor(currency);
}

export async function applyWithdraw(input: {
  userId: string;
  amount: number;
  accountInfo?: string;
  remark?: string;
  payeeName?: string;
  payeeMethod?: "bank" | "alipay" | "wechat" | "other";
  req?: NextRequest;
}): Promise<{ id: string; amount: number; currency: string }> {
  const config = await getDistributionConfig();
  const amount = round2(Number(input.amount));

  if (!Number.isFinite(amount) || amount <= 0) throw badRequest("Invalid withdrawal amount");

  // 账户结算币种：提现金额、最低额与风控限额全部以它计价
  const account = await prisma.distributorAccount.findUnique({
    where: { userId: input.userId },
    select: { termsAcceptedAt: true, settlementCurrency: true },
  });
  const settlementCurrency = account?.settlementCurrency ?? "CNY";

  // 最低提现额按结算币种折算（配置以 CNY 心智维护，如 100 → USD 账户约 14）
  const cnyPerUnit = await cnyRateFor(settlementCurrency);
  const minInCurrency = round2(config.minWithdrawAmount / (cnyPerUnit > 0 ? cnyPerUnit : 1));
  if (amount < minInCurrency) {
    throw badRequest(
      `Minimum withdrawal amount is ${minInCurrency} ${settlementCurrency}`,
    );
  }

  // 风控闸门（P0-5）：日/月累计上限 + 冷却期。放在"在途检查"之前 ——
  // 超额/冷却期是更硬的拒绝理由，先给用户最相关的那条提示。
  await assertWithdrawLimits(input.userId, amount, config, settlementCurrency);

  const inflight = await prisma.withdrawRecord.count({
    where: { userId: input.userId, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (inflight > 0) throw conflict("You already have a withdrawal request in progress; please wait until it is processed");

  /* KYC：一期是**线下打款**，必须能核对到人。实名与收款方式首次必填，
     之后可省略并沿用上一次的值（避免每次重复录入）。服务端强校验，不依赖前端。 */
  const lastKyc = await prisma.withdrawRecord.findFirst({
    where: { userId: input.userId, payeeName: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { payeeName: true, payeeMethod: true },
  });
  const payeeName = input.payeeName?.trim() || lastKyc?.payeeName || null;
  const payeeMethod = input.payeeMethod || lastKyc?.payeeMethod || null;
  if (!payeeName) throw badRequest("Please provide the payee real name (required for identity verification before payout)");
  if (!payeeMethod) throw badRequest("Please choose a payout method");

  // 《分销规则》确认留痕：提现是产生资金往来的动作，必须留下确认时间
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
      if (claimed.count === 0) {
        // 欠款语境（资金审计 M6）：余额为负是被「已提现后退款冲正」扣穿的显式台账
        // 状态 —— 拒绝提现时把原因说清，不再让分销商面对一句干巴巴的「余额不足」
        const acct = await tx.distributorAccount.findUnique({
          where: { userId: input.userId },
          select: { debt: true, settlementCurrency: true },
        });
        if (acct && Number(acct.debt) > 0) {
          throw badRequest(
            `Insufficient withdrawable balance: your account carries a debt of ${Number(acct.debt).toFixed(2)} ${acct.settlementCurrency} from a refunded order — future commissions will automatically offset it`,
          );
        }
        throw badRequest("Insufficient withdrawable balance");
      }

      return tx.withdrawRecord.create({
        data: {
          userId: input.userId,
          amount,
          // 币种快照：账户结算币种变更不影响历史提现单的金额语义
          currency: settlementCurrency,
          // CNY 等值快照（币种混算修复 2026-09-26）：管理端总览的「待打款合计」
          // 由此列跨币种安全加总 —— 此前直接 Σ amount 把 $100 当 ¥100 计入。
          // 汇率申请时固化（同佣金计提模式），此后波动不影响历史申请。
          amountCny: round2(amount * cnyPerUnit),
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
      throw conflict("You already have a withdrawal request in progress; please wait until it is processed");
    }
    throw err;
  }

  // 旁路通知（不 await：邮件可能走真实 SMTP）
  void notifyWithdrawStatus({
    userId: input.userId,
    status: "PENDING",
    amountSettle: amount,
    settleCurrency: settlementCurrency,
  }).catch(() => undefined);

  // 运营审计 5-1：提现是纯资金出账，此前只写审计 —— 申请躺在列表无人知，客户等钱。
  void notifyAdmins({
    type: "system",
    title: "新的提现申请",
    titleEn: "New withdrawal request",
    body: `有新的提现申请待审核，请及时处理。`,
    bodyEn: `A new withdrawal request is awaiting review.`,
    link: "/admin/distribution/withdrawals",
    meta: { userId: input.userId },
  }).catch(() => {});

  await audit({
    userId: input.userId,
    action: "DISTRIBUTION_WITHDRAW_APPLY",
    entity: "WithdrawRecord",
    entityId: record.id,
    meta: { amount, currency: settlementCurrency },
    req: input.req,
  });
  logger.info(
    { userId: input.userId, amount, currency: settlementCurrency },
    "分销：提现申请已提交",
  );

  return { id: record.id, amount: Number(record.amount), currency: settlementCurrency };
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
  if (!record) throw notFound("Withdrawal request not found");

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
    if (claimed.count === 0) throw conflict("This withdrawal request cannot be approved in its current state");
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
      if (claimed.count === 0) throw conflict("This withdrawal request cannot be marked as paid in its current state");
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
      if (claimed.count === 0) throw conflict("This withdrawal request cannot be rejected in its current state");
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
      amountSettle: amount,
      settleCurrency: record.currency,
      note: input.note ?? null,
    }).catch(() => undefined);
  }

  await audit({
    userId: input.actorId,
    action: `DISTRIBUTION_WITHDRAW_${input.action.toUpperCase()}`,
    entity: "WithdrawRecord",
    entityId: record.id,
    meta: { targetUserId: record.userId, amount, currency: record.currency, note: input.note ?? "" },
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
      currency: r.currency,
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
      currency: r.currency,
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

/**
 * 设置/变更账户结算币种（2026-09-24 多币种结算）。
 *
 * 硬约束：**余额、冻结均为 0 且没有任何佣金流水**时才允许变更。
 * 为什么：账本余额按结算币种计价，历史流水 amountSettle 也是同一币种的快照；
 * 中途换币种会让「Σ流水净额 = 账户余额」的对账口径断裂（旧币种流水
 * 混入新币种余额）。有佣金进账后想换币种，只能先提空余额 —— 此时流水
 * 与余额均为 0，换币种不破坏任何口径。
 *
 * 新开户（无任何流水）不受限，分销客可在产生第一笔佣金前自由选定。
 */
export async function setSettlementCurrency(input: {
  userId: string;
  currency: string;
  req?: NextRequest;
}): Promise<{ settlementCurrency: string }> {
  const currency = input.currency.trim().toUpperCase();
  // 顾客可见文案走英文源串（英文站默认语言），中文由 lib/error-i18n.ts 按请求语言替换
  if (!/^[A-Z]{3}$/.test(currency)) throw badRequest("Settlement currency must be a 3-letter ISO 4217 code");

  // 商用审计修复（高危）：只接受系统已启用（CurrencyConfig.enabled）的币种。
  // 此前任意 /^[A-Z]{3}$/ 伪代码都能设进账户 —— "XXX" 这类码会让该受益人的
  // 佣金折算永远失败而被跳过，且「部分受益人已落库」会让整单永不再计提
  // （already>0 短路），该级佣金永久丢失且 reconcile 不再扫。
  const cfg = await prisma.currencyConfig.findUnique({ where: { code: currency } });
  if (!cfg?.enabled) {
    throw badRequest(
      // 顾客可见文案走英文源串，中文由 lib/error-i18n.ts 按请求语言替换
      `Settlement currency ${currency} is not enabled — choose from the available currencies`,
    );
  }

  // 商用审计修复（高危）：守卫必须与计提的账户读取在同一把锁下串行。
  // 此前是「无事务的 count + upsert」：分销商在支付回调触发 accrueForOrder
  // 读币种的瞬间并发改币种，计提会把 CNY 面额固化进 EUR 账户的流水（≈8 倍
  // 放大入账）。锁账户行 + 锁内查流水数，改币种与首笔计提只能串行发生。
  const account = await prisma.$transaction(async (tx) => {
    // 行锁账户（无行则锁 userId 对应的空账户不存在 —— 用 upsert 后的行锁）
    await tx.$queryRaw`
      SELECT id FROM distributor_accounts WHERE "userId" = ${input.userId} FOR UPDATE
    `;
    const [lockedAccount, logCount] = await Promise.all([
      tx.distributorAccount.findUnique({ where: { userId: input.userId } }),
      tx.commissionLog.count({ where: { toUserId: input.userId } }),
    ]);
    const balance = Number(lockedAccount?.balance ?? 0);
    const frozen = Number(lockedAccount?.frozen ?? 0);

    if (lockedAccount && (balance !== 0 || frozen !== 0 || logCount > 0)) {
      if (lockedAccount.settlementCurrency === currency) {
        return lockedAccount; // 幂等：未变化直接返回
      }
      throw badRequest(
        // 顾客可见文案走英文源串，中文由 lib/error-i18n.ts 按请求语言替换
        "Account has commission logs or balance — settlement currency cannot be changed (withdraw the full balance first; only new accounts can choose freely)",
      );
    }

    return tx.distributorAccount.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, settlementCurrency: currency },
      update: { settlementCurrency: currency },
    });
  });
  logger.info(
    { userId: input.userId, currency },
    "分销：结算币种已设置",
  );
  return { settlementCurrency: account.settlementCurrency };
}
