import { NextRequest } from "next/server";
import { apiHandler, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { badRequest } from "@/lib/errors";
import {
  deleteAll,
  deleteAllRead,
  deleteNotification,
  getUnreadCount,
  listForUser,
  markAllRead,
  markRead,
} from "@/server/services/notification.service";

export const runtime = "nodejs";

/**
 * GET /api/admin/notifications — 管理员站内消息中心
 * 前端动作（新订单/退款申请/新用户注册/补货提醒）都会写入管理员的站内通知，
 * 此接口供后台消息中心页读取，保证运营信息不静默。
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireAdmin();
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
  const list = await listForUser(user.id, { limit: 50 });
  const filtered = unreadOnly ? list.filter((n) => n.isUnread) : list;
  const unreadCount = await getUnreadCount(user.id);
  return json({ notifications: filtered, unreadCount });
});

/** PATCH /api/admin/notifications — 标已读（单条或全部） */
export const PATCH = apiHandler(async (req: NextRequest) => {
  const user = await requireAdmin();
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    await markRead(user.id, id);
    return json({ ok: true });
  }
  const count = await markAllRead(user.id);
  return json({ ok: true, marked: count });
});

/**
 * DELETE /api/admin/notifications?id=<id> — 删除单条
 * DELETE /api/admin/notifications?readOnly=true — 清空已读
 * DELETE /api/admin/notifications?all=true — 清空全部
 */
export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await requireAdmin();
  const id = req.nextUrl.searchParams.get("id");
  const all = req.nextUrl.searchParams.get("all") === "true";
  const readOnly = req.nextUrl.searchParams.get("readOnly") === "true";

  if (id) {
    await deleteNotification(user.id, id);
    return json({ ok: true, deleted: 1 });
  }
  if (all) {
    const count = await deleteAll(user.id);
    return json({ ok: true, deleted: count });
  }
  if (readOnly) {
    const count = await deleteAllRead(user.id);
    return json({ ok: true, deleted: count });
  }
  throw badRequest("缺少删除参数（id / all / readOnly）");
});
