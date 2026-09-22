import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { z } from "zod";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { listRebindRequests, reviewRebindRequest } from "@/server/services/distribution";

export const runtime = "nodejs";

const PAGE_SIZE = 20;

/** GET /api/admin/distribution/rebinds — 换绑申请列表（默认全部，可按状态筛选） */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  await requireAdmin();
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const status = url.searchParams.get("status")?.trim() || undefined;
  const { rows, total, pending } = await listRebindRequests({
    ...(status ? { status } : {}),
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return json({
    data: rows,
    pending,
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) },
  });
});

const reviewSchema = z.object({
  requestId: z.string().trim().min(1).max(64),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(200).optional(),
});

/** POST /api/admin/distribution/rebinds — 审核换绑（通过时会重建整棵子树闭包） */
export const POST = apiHandler(async (req) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const input = await readJson(req, reviewSchema);
  const result = await reviewRebindRequest({
    requestId: input.requestId,
    action: input.action,
    actorId: actor.id,
    ...(input.note ? { note: input.note } : {}),
    req,
  });
  return json({ ok: true, ...result });
});
