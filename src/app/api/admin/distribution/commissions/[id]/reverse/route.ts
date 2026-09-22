import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { z } from "zod";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { reverseCommissionManually } from "@/server/services/distribution";

export const runtime = "nodejs";

const schema = z.object({
  /** 冲正金额（订单币种）；不传 = 全额冲正 */
  amount: z.coerce.number().positive().max(1_000_000).nullable().optional(),
  /** 冲正原因（必填：资金动作必须留下人话解释） */
  note: z.string().trim().min(2).max(200),
});

/**
 * POST /api/admin/distribution/commissions/[id]/reverse — 人工冲正单条佣金（P1-8）
 * 用于刷单认定 / 客服赔付 / 错单纠正等自动冲正覆盖不到的场景。
 */
export const POST = apiHandler(async (req, ctx) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, schema);

  const result = await reverseCommissionManually({
    logId: id,
    amount: input.amount ?? null,
    note: input.note,
    actorId: actor.id,
    req,
  });
  return json({ ok: true, ...result });
});
