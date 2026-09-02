import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * 站内消息中心服务：
 *  - createNotification: 写一条通知（可选多语）
 *  - listForUser: 列出用户消息（按时间倒序，limit）
 *  - markRead: 标单条已读
 *  - markAllRead: 全部已读
 *  - getUnreadCount: 未读数（角标）
 *
 * 设计：
 *  - title/body 双语（zh fallback），按用户 lang 选语种
 *  - type 标准化：order / refund / price_alert / system
 *  - link 跳转到 /orders/[n] /account/refunds /products/[slug] 等
 */
export type NotificationType = "order" | "refund" | "price_alert" | "system";

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  /** zh fallback（必填） */
  title: string;
  /** 英文（可空） */
  titleEn?: string | null;
  /** zh fallback（必填） */
  body: string;
  /** 英文（可空） */
  bodyEn?: string | null;
  /** 跳转链接（可空，纯消息） */
  link?: string | null;
  /** 元数据（订单号等） */
  meta?: Record<string, unknown> | null;
}

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  titleEn: string | null;
  body: string;
  bodyEn: string | null;
  link: string | null;
  meta: unknown;
  isUnread: boolean;
  createdAt: Date;
}

/** 写一条消息 */
export async function createNotification(input: NotificationInput): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      titleEn: input.titleEn ?? null,
      body: input.body,
      bodyEn: input.bodyEn ?? null,
      link: input.link ?? null,
      meta: input.meta ? (input.meta as object) : undefined,
    },
  });
}

/** 批量写（同一用户多条） */
export async function createNotifications(inputs: NotificationInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const data = inputs.map((i) => ({
    userId: i.userId,
    type: i.type,
    title: i.title,
    titleEn: i.titleEn ?? null,
    body: i.body,
    bodyEn: i.bodyEn ?? null,
    link: i.link ?? null,
    meta: i.meta ? (i.meta as object) : undefined,
  }));
  const res = await prisma.notification.createMany({ data });
  return res.count;
}

/**
 * 通知所有活跃管理员/客服（ADMIN + SUPPORT）。
 * 用于「前端动作 → 后台必知」：新订单、退款申请、新用户注册、补货提醒等，
 * 保证运营信息不静默。返回写入条数。
 */
export async function notifyAdmins(input: Omit<NotificationInput, "userId">): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPPORT"] }, status: "ACTIVE" },
    select: { id: true },
  });
  if (admins.length === 0) return 0;
  return createNotifications(
    admins.map((a) => ({ ...input, userId: a.id })),
  );
}

/** 列消息（按时间倒序） */
export async function listForUser(
  userId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<NotificationRecord[]> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    titleEn: r.titleEn,
    body: r.body,
    bodyEn: r.bodyEn,
    link: r.link,
    meta: r.meta,
    isUnread: r.isUnread,
    createdAt: r.createdAt,
  }));
}

/** 未读数 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isUnread: true },
  });
}

/** 标单条已读 */
export async function markRead(userId: string, id: string): Promise<boolean> {
  const res = await prisma.notification.updateMany({
    where: { id, userId, isUnread: true },
    data: { isUnread: false },
  });
  return res.count > 0;
}

/** 全部标已读 */
export async function markAllRead(userId: string): Promise<number> {
  const res = await prisma.notification.updateMany({
    where: { userId, isUnread: true },
    data: { isUnread: false },
  });
  return res.count;
}

/** 删除单条（仅限本人） */
export async function deleteNotification(userId: string, id: string): Promise<boolean> {
  const res = await prisma.notification.deleteMany({
    where: { id, userId },
  });
  return res.count > 0;
}

/** 清空该用户全部已读消息，返回删除条数 */
export async function deleteAllRead(userId: string): Promise<number> {
  const res = await prisma.notification.deleteMany({
    where: { userId, isUnread: false },
  });
  return res.count;
}

/** 清空该用户全部消息，返回删除条数 */
export async function deleteAll(userId: string): Promise<number> {
  const res = await prisma.notification.deleteMany({
    where: { userId },
  });
  return res.count;
}
