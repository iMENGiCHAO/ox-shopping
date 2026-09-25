import "server-only";
import type { Prisma } from "@prisma/client";
import { cacheDel, cacheGet, cacheSet } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  ABSOLUTE_MAX_LEVELS,
  COMPLIANCE_MAX_LEVELS,
  DEFAULT_COMMISSION_RATIOS,
  DEFAULT_DISTRIBUTION_CONFIG,
  allowDeepCommissionLevels,
  type DistributionConfig,
} from "@/lib/distribution/contract";

/**
 * 分销策略配置（读写 `site_settings` 的 `distribution` 键）。
 *
 * 复用 SiteSetting 而不是新开一张表：配置项少、读写频次低、天然带 updatedAt，
 * 且与站点其它设置同一套持久化路径；缺失/脏数据一律回落到默认口径，
 * 保证「配置表坏了」不会导致分佣算成 0 或算穿利润。
 */

const CONFIG_KEY = "distribution";

/**
 * 返佣层级上限的**服务端强制夹取**（P0-4 合规红线）。
 *
 * 为什么不能只靠默认值：默认 3 只影响"没配过"的情况；后台把 3 改成 10 会直接落库生效。
 * 这里每次读取配置都夹一次 —— 即使 DB 里存着 10，实际生效的也只会是 3，
 * 除非显式设置 `DISTRIBUTION_ALLOW_DEEP_LEVELS=true`。
 * 被夹住时打 warn（含原值），便于运营发现"我明明配了 5 级怎么只返 3 级"。
 */
function clampCommissionLevels(value: number): number {
  const n = Math.min(ABSOLUTE_MAX_LEVELS, Math.max(1, Math.trunc(value)));
  if (n > COMPLIANCE_MAX_LEVELS && !allowDeepCommissionLevels()) {
    logger.warn(
      { requested: n, applied: COMPLIANCE_MAX_LEVELS },
      "分销：返佣层级被合规上限夹取（>3 级需设 DISTRIBUTION_ALLOW_DEEP_LEVELS=true）",
    );
    return COMPLIANCE_MAX_LEVELS;
  }
  return n;
}

function coerce(raw: unknown): DistributionConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DISTRIBUTION_CONFIG };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    bindTrigger: r.bindTrigger === "first_order" ? "first_order" : "register",
    allowRebind: bool(r.allowRebind, DEFAULT_DISTRIBUTION_CONFIG.allowRebind),
    bindExpireDays: Math.max(
      0,
      Math.trunc(num(r.bindExpireDays, DEFAULT_DISTRIBUTION_CONFIG.bindExpireDays)),
    ),
    maxCommissionLevels: clampCommissionLevels(
      num(r.maxCommissionLevels, DEFAULT_DISTRIBUTION_CONFIG.maxCommissionLevels),
    ),
    maxTotalRatio: Math.min(
      100,
      Math.max(0, num(r.maxTotalRatio, DEFAULT_DISTRIBUTION_CONFIG.maxTotalRatio)),
    ),
    selfPurchaseCommission: bool(
      r.selfPurchaseCommission,
      DEFAULT_DISTRIBUTION_CONFIG.selfPurchaseCommission,
    ),
    selfPurchaseCountForUpstream: bool(
      r.selfPurchaseCountForUpstream,
      DEFAULT_DISTRIBUTION_CONFIG.selfPurchaseCountForUpstream,
    ),
    settleHoldDays: Math.max(
      0,
      Math.trunc(num(r.settleHoldDays, DEFAULT_DISTRIBUTION_CONFIG.settleHoldDays)),
    ),
    minWithdrawAmount: Math.max(
      0,
      num(r.minWithdrawAmount, DEFAULT_DISTRIBUTION_CONFIG.minWithdrawAmount),
    ),
    // 风控额度（P0-5）：0 表示不限，故下限取 0；负数按 0 处理
    dailyWithdrawLimit: Math.max(
      0,
      num(r.dailyWithdrawLimit, DEFAULT_DISTRIBUTION_CONFIG.dailyWithdrawLimit),
    ),
    monthlyWithdrawLimit: Math.max(
      0,
      num(r.monthlyWithdrawLimit, DEFAULT_DISTRIBUTION_CONFIG.monthlyWithdrawLimit),
    ),
    withdrawCooldownHours: Math.max(
      0,
      Math.trunc(num(r.withdrawCooldownHours, DEFAULT_DISTRIBUTION_CONFIG.withdrawCooldownHours)),
    ),
    commissionBaseMode:
      r.commissionBaseMode === "PROFIT" ? "PROFIT" : DEFAULT_DISTRIBUTION_CONFIG.commissionBaseMode,
  };
}

/**
 * 分销配置缓存（P2-13）。
 *
 * 为什么值得缓存：配置在**每次绑定、每次下单归属、每次佣金计提、每次提现校验**里都要读，
 * 是这条链路上最热的单行查询；而它几乎不变（改一次要人工点保存）。
 *
 * 失效策略是**写时精准失效**（`saveDistributionConfig` → `invalidateDistributionCache()`），
 * 不依赖 TTL —— 否则"刚把比例从 10% 改成 8%，新订单还按 10% 算"这类问题会在生产上很难查。
 * Redis 不可用时自动退化为进程内存缓存（见 `lib/cache.ts`）。
 */
const CONFIG_CACHE_KEY = "distribution:config:v1";
const RULES_CACHE_KEY = "distribution:rules:v1";
/** 规则缓存 TTL 兜底 60s：规则可能被后台以外的方式改（脚本/运维），TTL 是最后的保险 */
const RULES_TTL_SECONDS = 60;

export async function invalidateDistributionCache(): Promise<void> {
  await Promise.all([cacheDel(CONFIG_CACHE_KEY), cacheDel(RULES_CACHE_KEY)]);
}

export async function getDistributionConfig(): Promise<DistributionConfig> {
  const cached = await cacheGet<DistributionConfig>(CONFIG_CACHE_KEY);
  if (cached) return coerce(cached);
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: CONFIG_KEY } });
    const value = coerce(row?.value);
    await cacheSet(CONFIG_CACHE_KEY, value);
    return value;
  } catch (err) {
    logger.warn({ err }, "读取分销配置失败，回落默认口径");
    return { ...DEFAULT_DISTRIBUTION_CONFIG };
  }
}

/**
 * 计提时用的启用规则（缓存版）。返回 {@link CommissionRuleLike} 需要的字段。
 * 命中缓存的调用点：`accrueForOrder`（每笔支付订单都会走）。
 */
export async function getActiveCommissionRules(): Promise<
  {
    scopeType: string;
    scopeId: string | null;
    level: number;
    mode: string;
    ratio: number;
    fixedAmount: number | null;
    enabled: boolean;
    effectiveAt: Date | null;
    expireAt: Date | null;
    tierLevel: number;
  }[]
> {
  const cached = await cacheGet<ReturnType<typeof mapRules>>(RULES_CACHE_KEY);
  if (cached) return cached;
  const rows = await prisma.commissionRule.findMany({ where: { enabled: true } });
  const mapped = mapRules(rows);
  await cacheSet(RULES_CACHE_KEY, mapped, RULES_TTL_SECONDS);
  return mapped;
}

function mapRules(
  rows: {
    scopeType: string;
    scopeId: string | null;
    level: number;
    mode: string;
    ratio: unknown;
    fixedAmount: unknown;
    tierLevel: number;
    enabled: boolean;
    effectiveAt: Date | null;
    expireAt: Date | null;
  }[],
) {
  return rows.map((r) => ({
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    level: r.level,
    mode: r.mode,
    ratio: Number(r.ratio),
    fixedAmount: r.fixedAmount == null ? null : Number(r.fixedAmount),
    enabled: r.enabled,
    effectiveAt: r.effectiveAt,
    expireAt: r.expireAt,
    tierLevel: r.tierLevel,
  }));
}

export async function saveDistributionConfig(
  patch: Partial<DistributionConfig>,
): Promise<DistributionConfig> {
  const current = await getDistributionConfig();
  const next = coerce({ ...current, ...patch });
  await prisma.siteSetting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  // 写时精准失效：下一次读取立刻拿到新口径（不能等 TTL）
  await invalidateDistributionCache();
  return next;
}

/**
 * 分销模块的「启用时间」基线（P0-4）。
 *
 * 为什么必须有：对账补偿会给「已支付但没有归属快照」的订单补归属，而补归属只能读到
 * **当前**的客户绑定关系 —— 对模块上线**之前**的历史订单来说，这等于用今天的绑定去改写
 * 历史归属（可能把订单错算给某个分销商）。因此记录一个启用时间戳：
 *   · 只对 `createdAt >= 启用时间` 的订单做归属补偿；
 *   · 更早的订单一次性写成 `natural=true`（自然单、不参与分佣），不再反复扫描。
 */
const ENABLED_AT_KEY = "distributionEnabledAt";

export async function getDistributionEnabledAt(): Promise<Date> {
  const row = await prisma.siteSetting.findUnique({ where: { key: ENABLED_AT_KEY } });
  if (row && typeof row.value === "string") {
    const parsed = new Date(row.value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  await prisma.siteSetting.upsert({
    where: { key: ENABLED_AT_KEY },
    create: { key: ENABLED_AT_KEY, value: now.toISOString() },
    update: {},
  });
  logger.info({ enabledAt: now.toISOString() }, "分销：已记录模块启用时间基线");
  return now;
}

/**
 * 幂等补齐默认佣金规则（GLOBAL 1..5），并**修复历史重复行**。
 *
 * 只在「一条 GLOBAL 规则都没有」时写入 —— 否则管理员删掉的层级会被自动复活。
 *
 * ⚠️ 这里必须修一个真实踩过的坑：PostgreSQL 的唯一索引里 **NULL 互不相等**，
 * 所以早期用 `scopeId: null` 播种的 GLOBAL 行，与后台（用空串写入）的行**各存一份**，
 * 同一 level 出现两条比例 —— 取哪条取决于查询顺序，等价于「佣金比例随机」。
 * 因此本函数每次调用都做一次幂等修复：按 level 去重（保留最近更新的一条）、
 * 并把剩余 GLOBAL 行的 scopeId 统一成空串，让唯一约束真正生效。
 */
/**
 * 历史脏数据自愈的进程内一次性标志。
 *
 * 为什么需要：本函数此前每次计佣（每笔支付订单）都执行「全量读 GLOBAL 规则 +
 * 去重删除 + 无条件 updateMany 写库」。去重与 scopeId 归一是**一次性数据修复**，
 * 不是每笔订单的职责 —— 它在高并发支付下与规则页写入争锁，且规则几乎不变。
 * 现在重活每个进程只做一次；轻活（空表播种判断）保留每次执行。
 */
let globalRulesCleanupDone = false;

export async function ensureDefaultCommissionRules(): Promise<number> {
  // ── 重活（进程内一次）：全量扫描 + 去重 + scopeId 归一 ──
  if (!globalRulesCleanupDone) {
    await cleanupDuplicateGlobalRules();
    globalRulesCleanupDone = true;
  }

  /* ── 轻活（每次执行）：通用规则缺失就播种 ──
     不能省：管理员可能删光规则，此时不播种会让 resolveRatio 对所有层级返回 0
     → 佣金静默算成 0（订单/页面/接口全正常）。一次 count（有索引）代价极小。 */
  const genericCount = await prisma.commissionRule.count({
    where: { scopeType: "GLOBAL", scopeId: "", tierLevel: 0 },
  });
  if (genericCount > 0) return 0;

  const data = Object.entries(DEFAULT_COMMISSION_RATIOS).map(([level, ratio]) => ({
    scopeType: "GLOBAL",
    scopeId: "",
    level: Number(level),
    ratio,
  }));
  const res = await prisma.commissionRule.createMany({ data, skipDuplicates: true });
  logger.info({ count: res.count }, "分销：已写入默认佣金规则（三级 10/5/2 + 预留四五级）");
  await invalidateDistributionCache();
  return res.count;
}

/** 历史脏数据自愈：重复 GLOBAL 规则去重 + NULL scopeId 归一（幂等，进程内只跑一次） */
async function cleanupDuplicateGlobalRules(): Promise<void> {
  const globals = await prisma.commissionRule.findMany({
    where: { scopeType: "GLOBAL" },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: { id: true, level: true, scopeId: true, tierLevel: true },
  });

  // 去重键必须含 tierLevel：否则「VIP 等级专用规则」会被当成同层级的重复行删掉
  // （P0-1 的另一面：等级规则与通用规则此刻已能共存）
  const seenKeys = new Set<string>();
  const duplicateIds: string[] = [];
  for (const r of globals) {
    const key = `${r.level}:${r.tierLevel}`;
    if (seenKeys.has(key)) duplicateIds.push(r.id);
    else seenKeys.add(key);
  }
  if (duplicateIds.length > 0) {
    await prisma.commissionRule.deleteMany({ where: { id: { in: duplicateIds } } });
    logger.warn(
      { removed: duplicateIds.length },
      "分销：清理重复的 GLOBAL 佣金规则（比例随机隐患）",
    );
  }
  // NULL 不进唯一约束 → 统一成空串占位（与后台写入口径一致）
  await prisma.commissionRule.updateMany({
    where: { scopeType: "GLOBAL", scopeId: null },
    data: { scopeId: "" },
  });

  // 清理过重复行 → 缓存的规则快照作废
  if (duplicateIds.length > 0) await invalidateDistributionCache();
}
