import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { deleteMyReview } from "@/server/services/review.service";
import { audit } from "@/lib/audit";

/** 删除自己的评价 */
export const DELETE = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const id = routeParam(ctx.params.id);
  await deleteMyReview(user.id, id);
  await audit({ userId: user.id, action: "REVIEW_DELETE", entity: "Review", entityId: id, req });
  return json({ ok: true });
});
