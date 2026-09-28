import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { reviewStatusSchema } from "@/lib/validations/review";
import { adminSetReviewStatus } from "@/server/services/review.service";

/** admin：下架/恢复评价（聚合重算） */
export const PATCH = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, reviewStatusSchema);
  await adminSetReviewStatus(actor, id, input.status);
  return json({ ok: true });
});
