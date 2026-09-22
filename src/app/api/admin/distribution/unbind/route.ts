import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { distributionUnbindSchema } from "@/lib/validations/distribution";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { releaseBind } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * POST /api/admin/distribution/unbind — 管理员解绑客户归属（风控/换绑审核）。
 * 历史订单的佣金归属**不受影响**（归属已在下单时固化成快照）。
 */
export const POST = apiHandler(async (req) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const input = await readJson(req, distributionUnbindSchema);
  const result = await releaseBind({
    bindId: input.bindId,
    actorId: actor.id,
    ...(input.note ? { note: input.note } : {}),
    req,
  });
  return json({ ok: true, ...result });
});
