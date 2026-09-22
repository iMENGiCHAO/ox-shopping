import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/errors";
import { commissionRuleSchema } from "@/lib/validations/distribution";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { ensureDefaultCommissionRules } from "@/server/services/distribution";
import { invalidateDistributionCache } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * `scopeId` 规范化：GLOBAL 规则用**空串**而不是 NULL。
 *
 * 原因：PostgreSQL 的唯一索引里 NULL 互不相等，`@@unique([scopeType, scopeId, level])`
 * 对 GLOBAL(NULL) 形同虚设 —— 同层级可以插出任意多条全局规则，佣金比例取哪条全看
 * 查询顺序（线上会变成"比例随机"）。用空串占位让唯一约束真正生效。
 */
function normalizeScopeId(scopeType: string, scopeId: string | null | undefined): string {
  if (scopeType === "GLOBAL") return "";
  if (!scopeId) throw badRequest("CATEGORY/PRODUCT 规则必须指定 scopeId");
  return scopeId;
}

/** GET /api/admin/distribution/rules — 佣金规则全量（首次自动补齐默认三级 10/5/2） */
export const GET = apiHandler(async () => {
  assertDistributionEnabled();
  await requireAdmin();
  await ensureDefaultCommissionRules();
  const rules = await prisma.commissionRule.findMany({
    orderBy: [{ scopeType: "asc" }, { level: "asc" }, { scopeId: "asc" }],
  });
  return json({
    rules: rules.map((r) => ({
      id: r.id,
      scopeType: r.scopeType,
      scopeId: r.scopeId === "" ? null : r.scopeId,
      level: r.level,
      mode: r.mode === "FIXED" ? "FIXED" : "RATIO",
      ratio: Number(r.ratio),
      fixedAmount: r.fixedAmount == null ? null : Number(r.fixedAmount),
      tierLevel: r.tierLevel ?? null,
      enabled: r.enabled,
      effectiveAt: r.effectiveAt ? r.effectiveAt.toISOString() : null,
      expireAt: r.expireAt ? r.expireAt.toISOString() : null,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
});

/** POST /api/admin/distribution/rules — 新增/覆盖一条规则（同 scope+level 幂等 upsert） */
export const POST = apiHandler(async (req) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const input = await readJson(req, commissionRuleSchema);
  const scopeId = normalizeScopeId(input.scopeType, input.scopeId);
  // ⚠️ 0 = 通用规则（非空哨兵）。唯一键必须含 tierLevel，否则「等级专用规则」会
  //    覆盖同层级的通用规则，导致该层级佣金静默归零（P0-1）。
  const tierLevel = input.tierLevel ?? 0;

  const rule = await prisma.commissionRule.upsert({
    where: {
      scopeType_scopeId_level_tierLevel: {
        scopeType: input.scopeType,
        scopeId,
        level: input.level,
        tierLevel,
      },
    },
    create: {
      scopeType: input.scopeType,
      scopeId,
      level: input.level,
      mode: input.mode,
      ratio: input.mode === "FIXED" ? 0 : input.ratio,
      fixedAmount: input.mode === "FIXED" ? input.fixedAmount : null,
      tierLevel,
      enabled: input.enabled,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
      expireAt: input.expireAt ? new Date(input.expireAt) : null,
    },
    update: {
      mode: input.mode,
      ratio: input.mode === "FIXED" ? 0 : input.ratio,
      fixedAmount: input.mode === "FIXED" ? input.fixedAmount : null,
      enabled: input.enabled,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
      expireAt: input.expireAt ? new Date(input.expireAt) : null,
    },
  });

  await invalidateDistributionCache();
  await audit({
    userId: actor.id,
    action: "DISTRIBUTION_RULE_UPSERT",
    entity: "CommissionRule",
    entityId: rule.id,
    meta: { ...input, scopeId },
    req,
  });
  return json({ ok: true, id: rule.id });
});
