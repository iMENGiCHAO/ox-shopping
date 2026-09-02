import { NextRequest } from "next/server";
import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import {
  deleteAll,
  deleteAllRead,
  getUnreadCount,
  listForUser,
  markAllRead,
} from "@/server/services/notification.service";

/**
 * GET /api/notifications
 * 列当前用户的消息（按时间倒序，最多 50 条）
 * Query:
 *   - unreadOnly=true 仅未读
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
  const list = await listForUser(user.id, { limit: 50 });
  const filtered = unreadOnly ? list.filter((n) => n.isUnread) : list;
  const unreadCount = await getUnreadCount(user.id);
  return json({ notifications: filtered, unreadCount });
});

/**
 * PATCH /api/notifications
 * 全部标已读（{ allRead: true }）
 */
export const PATCH = apiHandler(async () => {
  const user = await requireUser();
  const count = await markAllRead(user.id);
  return json({ marked: count });
});

/**
 * DELETE /api/notifications
 * Query:
 *   - readOnly=true  清空已读
 *   - all=true       清空全部（含未读，需前端二次确认）
 */
export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const readOnly = req.nextUrl.searchParams.get("readOnly") === "true";
  const all = req.nextUrl.searchParams.get("all") === "true";

  if (all) {
    const n = await deleteAll(user.id);
    return json({ ok: true, deleted: n });
  }
  if (readOnly) {
    const n = await deleteAllRead(user.id);
    return json({ ok: true, deleted: n });
  }
  return json({ ok: false, deleted: 0 });
});
