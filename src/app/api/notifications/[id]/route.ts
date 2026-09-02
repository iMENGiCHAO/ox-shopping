import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { markRead, deleteNotification } from "@/server/services/notification.service";
import { routeParam } from "@/app/api/_lib/params";

/**
 * PATCH /api/notifications/[id]
 * 单条标已读
 */
export const PATCH = apiHandler(async (_req, ctx) => {
  const user = await requireUser();
  const id = routeParam(ctx.params.id);
  const ok = await markRead(user.id, id);
  return json({ ok });
});

/**
 * DELETE /api/notifications/[id]
 * 删除单条（仅限本人）
 */
export const DELETE = apiHandler(async (_req, ctx) => {
  const user = await requireUser();
  const id = routeParam(ctx.params.id);
  const ok = await deleteNotification(user.id, id);
  return json({ ok, deleted: ok ? 1 : 0 });
});
