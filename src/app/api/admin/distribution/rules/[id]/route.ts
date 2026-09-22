import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/errors";
import { routeParam } from "@/app/api/_lib/params";
import { commissionRuleSchema } from "@/lib/validations/distribution";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { invalidateDistributionCache } from "@/server/services/distribution";

export const runtime = "nodejs";

/** PUT /api/admin/distribution/rules/[id] — 修改比例/固定金额/启停/生效期 */
export const PUT = apiHandler(async (req, ctx) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, commissionRuleSchema);

  const existing = await prisma.commissionRule.findUnique({ where: { id } });
  if (!existing) throw notFound("规则不存在");

  const rule = await prisma.commissionRule.update({
    where: { id },
    data: {
      mode: input.mode,
      ratio: input.mode === "FIXED" ? 0 : input.ratio,
      fixedAmount: input.mode === "FIXED" ? input.fixedAmount : null,
      // 0 = 通用规则（非空哨兵）；改 tierLevel 等于把规则改成「某等级专用」
      tierLevel: input.tierLevel ?? 0,
      enabled: input.enabled,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
      expireAt: input.expireAt ? new Date(input.expireAt) : null,
    },
  });
  await invalidateDistributionCache();
  await audit({
    userId: actor.id,
    action: "DISTRIBUTION_RULE_UPDATE",
    entity: "CommissionRule",
    entityId: id,
    meta: { ...input },
    req,
  });
  return json({ ok: true, id: rule.id });
});

/** DELETE /api/admin/distribution/rules/[id] — 删除规则（只删规则，已有佣金流水不动） */
export const DELETE = apiHandler(async (req, ctx) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);

  const existing = await prisma.commissionRule.findUnique({ where: { id } });
  if (!existing) throw notFound("规则不存在");
  await prisma.commissionRule.delete({ where: { id } });
  await invalidateDistributionCache();
  await audit({
    userId: actor.id,
    action: "DISTRIBUTION_RULE_DELETE",
    entity: "CommissionRule",
    entityId: id,
    meta: { scopeType: existing.scopeType, level: existing.level },
    req,
  });
  return json({ ok: true });
});
