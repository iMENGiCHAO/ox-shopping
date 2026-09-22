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
 *  - type 标准化：order / refund / system
 *  - link 跳转到 /orders/[n] /account/refunds /products/[slug] 等
 */
export type NotificationType = "order" | "refund" | "system" | "distribution";

export interface NotificationInput {
  /**
   * 收件用户。null = 没有账号可归属（如游客订单），createNotification 会静默跳过。
   * 之所以允许 null 而不是让每个调用点自己判空：漏判会让整条下单流程 500。
   */
  userId: string | null;
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

/** 写一条消息。userId 为 null（游客订单等无账号场景）时静默跳过——没有用户就没有消息中心。 */
export async function createNotification(input: NotificationInput): Promise<void> {
  if (!input.userId) return;
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

/** 批量写（同一用户多条）。无账号可归属的条目（游客订单）直接丢弃。 */
export async function createNotifications(inputs: NotificationInput[]): Promise<number> {
  const deliverable = inputs.filter(
    (i): i is NotificationInput & { userId: string } => !!i.userId,
  );
  if (deliverable.length === 0) return 0;
  const data = deliverable.map((i) => ({
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
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
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
