import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { withdrawAuditSchema } from "@/lib/validations/distribution";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { auditWithdraw } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * POST /api/admin/distribution/withdrawals/[id] — 处理提现：
 *   approve 审核通过（待打款） / paid 已线下打款（核销冻结） / reject 驳回（解冻退回余额）
 */
export const POST = apiHandler(async (req, ctx) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, withdrawAuditSchema);

  const result = await auditWithdraw({
    id,
    action: input.action,
    actorId: actor.id,
    ...(input.note ? { note: input.note } : {}),
    ...(input.payNote ? { payNote: input.payNote } : {}),
    req,
  });
  return json({ ok: true, ...result });
});
