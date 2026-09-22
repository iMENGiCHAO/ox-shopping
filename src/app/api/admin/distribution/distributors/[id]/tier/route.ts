import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { z } from "zod";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { setDistributorTier } from "@/server/services/distribution";

export const runtime = "nodejs";

const schema = z.object({
  tier: z.coerce.number().int().min(0).max(10),
  note: z.string().trim().max(200).optional(),
});

/**
 * POST /api/admin/distribution/distributors/[id]/tier — 调整分销商等级（P2-15）。
 *
 * 等级只影响**之后**产生的佣金（按 `commission_rules.tierLevel` 命中差异化比例），
 * 历史流水不回算 —— 账本本来就是按当时的规则快照落库的。
 */
export const POST = apiHandler(async (req, ctx) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const userId = routeParam(ctx.params.id);
  const input = await readJson(req, schema);
  const result = await setDistributorTier({
    userId,
    tier: input.tier,
    actorId: actor.id,
    ...(input.note ? { note: input.note } : {}),
    req,
  });
  return json({ ok: true, ...result });
});
