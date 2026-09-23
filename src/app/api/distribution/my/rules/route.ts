import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import {
  ensureDefaultCommissionRules,
  getDistributionConfig,
} from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * GET /api/distribution/my/rules — 分销商可见的**规则说明数据**。
 *
 * 为什么单独做一个接口，而不是在页面里写死一份"说明文档"：
 *   说明里必须出现的层级比例、总比例上限、持有期、最低提现金额**都是后台可改的**。
 *   写死的文档一定会和实际结算口径漂移（"页面说 10%，实际算 5%"是最招投诉的 bug）。
 *   这里直接读当前配置与启用中的规则，页面照着渲染 —— 规则改完刷新即同步。
 *
 * 只回「分销商该知道的」：不泄露其它分销商数据、不泄露风控内部阈值；
 * 分类/商品级规则的**明细**也不下发，只告知"存在更细的规则"（避免规则被反向套利）。
 */
export const GET = apiHandler(async () => {
  assertDistributionEnabled();
  await requireUser();

  // 自愈：顺带修复历史重复的 GLOBAL 规则（NULL/空串并存 → 同层级两条比例），
  // 并保证「还没人计过佣」时页面也能看到默认规则
  await ensureDefaultCommissionRules();

  const [config, rules, scopedCount, tierRuleCount] = await Promise.all([
    getDistributionConfig(),
    prisma.commissionRule.findMany({
      // 只下发**通用规则**（tierLevel=0）。等级专用规则（tierLevel>0）不发明细
      // —— 否则同 level 会出现两条不同比例、且不带等级标识的数据，
      // 分销商看到的比例与实际生效口径不符（下方 tierRuleCount 只告知"存在等级差异"）。
      where: { enabled: true, scopeType: "GLOBAL", tierLevel: 0 },
      orderBy: { level: "asc" },
      select: {
        level: true,
        mode: true,
        ratio: true,
        fixedAmount: true,
        effectiveAt: true,
        expireAt: true,
      },
    }),
    prisma.commissionRule.count({
      where: { enabled: true, scopeType: { in: ["CATEGORY", "PRODUCT"] } },
    }),
    prisma.commissionRule.count({ where: { enabled: true, tierLevel: { gt: 0 } } }),
  ]);

  return json({
    config: {
      bindTrigger: config.bindTrigger,
      allowRebind: config.allowRebind,
      bindExpireDays: config.bindExpireDays,
      maxCommissionLevels: config.maxCommissionLevels,
      maxTotalRatio: config.maxTotalRatio,
      selfPurchaseCommission: config.selfPurchaseCommission,
      selfPurchaseCountForUpstream: config.selfPurchaseCountForUpstream,
      settleHoldDays: config.settleHoldDays,
      minWithdrawAmount: config.minWithdrawAmount,
    },
    /** 全局层级比例（后台「佣金规则」页维护） */
    // 口径与生效期一并下发：规则说明页必须如实展示"每单固定 X"或"按比例 X%"
    levels: rules.map((r) => ({
      level: r.level,
      mode: r.mode === "FIXED" ? "FIXED" : "RATIO",
      ratio: Number(r.ratio),
      fixedAmount: r.fixedAmount == null ? null : Number(r.fixedAmount),
      effectiveAt: r.effectiveAt ? r.effectiveAt.toISOString() : null,
      expireAt: r.expireAt ? r.expireAt.toISOString() : null,
    })),
    /** 是否存在分类/商品级差异化规则（不发明细） */
    hasScopedRules: scopedCount > 0,
    /** 是否存在按分销商等级差异化的规则（不发明细，避免规则被套利） */
    hasTierRules: tierRuleCount > 0,
  });
});
