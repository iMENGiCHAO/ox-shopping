import "server-only";
import type { NextRequest } from "next/server";
import type { PasswordResetStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { revokeAllUserTokens } from "@/lib/auth/session";
import { sendMail } from "@/lib/mail";
import { getSiteSettings } from "@/server/services/settings.service";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { notifyAdmins } from "@/server/services/notification.service";

/**
 * 找回密码（B-2 原站式人工审批流）。
 *
 * 闭环：
 *   ① 用户在 `/auth/forgot-password` 填邮箱提交申请（防枚举，永远同一句回执）
 *   ② 申请落库为 PENDING，同时写入管理员消息中心（后台不会漏看）
 *   ③ 管理员在 `/admin/password-resets` 待处理列表批准或驳回
 *   ④ 批准：服务端生成**强随机临时密码** → bcrypt 入库 → 账号置
 *      `mustChangePassword` → 邮件发送明文临时密码 → 吊销该用户全部旧会话
 *   ⑤ 用户首次登录被 `proxy.ts` + `requireUser()` 双重门控钉在改密页，
 *      改密成功后清除标记
 *
 * 安全边界（改这里之前先读）：
 *   - 明文临时密码**只**出现在两处：发出的邮件、批准接口的一次性响应
 *     （给管理员作为邮件服务不可用时的兜底）。数据库里只有 bcrypt 哈希，
 *     后台列表永远不回显历史临时密码。
 *   - 申请必须是**人工审批**，不做「邮箱即凭证」的自动放行。
 *   - 匿名化注销中的账号不再受理找回（避免与注销流程互相打架）。
 */

/* ─────────────────────────── 临时密码生成 ─────────────────────────── */

/**
 * 生成逻辑在 `@/lib/auth/temp-password`（纯密码学工具，可被单测直接覆盖）。
 * 这里 re-export，业务侧只认服务模块即可。
 */
export { TEMP_PASSWORD_LENGTH, generateTempPassword } from "@/lib/auth/temp-password";

/** 邮件通道是否真的配置了（未配置时后台需提示管理员手工转达临时密码） */
export function isMailConfigured(): boolean {
  return (
    (env.MAIL_PROVIDER === "resend" && !!env.RESEND_API_KEY) ||
    (env.MAIL_PROVIDER === "smtp" && !!env.SMTP_HOST)
  );
}

/* ─────────────────────────── ① 用户提交申请 ─────────────────────────── */

export interface CreateResetRequestResult {
  /**
   * 是否真的新建了申请。
   *
   * 注意：调用方**不要**把该值回给前台 —— 邮箱不存在、账号停用、已有在途申请
   * 都会是 false，一旦区分口径就变成邮箱枚举漏洞（前台永远回同一句）。
   */
  created: boolean;
}

export async function createPasswordResetRequest(input: {
  email: string;
  note?: string;
  ip?: string;
  req?: NextRequest;
}): Promise<CreateResetRequestResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      deletionRequestedAt: true,
    },
  });

  // 统一静默：邮箱不存在 / 账号停用 / 注销处理中，一律不建申请也不报错
  if (!user || user.status !== "ACTIVE" || user.deletionRequestedAt) {
    return { created: false };
  }

  // 同一账号同时只允许一份在途申请（防刷单、防后台待办被同一人刷满）
  const pending = await prisma.passwordResetRequest.findFirst({
    where: { userId: user.id, status: "PENDING" },
    select: { id: true },
  });
  if (pending) return { created: false };

  const request = await prisma.passwordResetRequest.create({
    data: {
      userId: user.id,
      email: user.email,
      note: input.note?.trim() || null,
      ip: input.ip ?? null,
    },
    select: { id: true },
  });

  await audit({
    userId: user.id,
    action: "AUTH_PASSWORD_RESET_REQUEST",
    entity: "PasswordResetRequest",
    entityId: request.id,
    meta: { email: user.email },
    req: input.req,
  });

  // 后台衔接（与注销申请同一口径）：申请不能只躺在库里，消息中心必须立即可见
  await notifyAdmins({
    type: "system",
    title: "客户申请找回密码",
    titleEn: "Customer requested a password reset",
    body: `${user.name}（${user.email}）提交了找回密码申请，请在「找回密码」页审核并发放临时密码。`,
    bodyEn: `${user.name} (${user.email}) requested a password reset. Review it on the Password Resets page and issue a temporary password.`,
    link: "/admin/password-resets",
    meta: { requestId: request.id, userId: user.id, email: user.email },
  });

  return { created: true };
}

/* ─────────────────────────── ② 后台列表 ─────────────────────────── */

export interface PasswordResetRequestRow {
  id: string;
  email: string;
  status: PasswordResetStatus;
  note: string | null;
  rejectReason: string | null;
  ip: string | null;
  createdAt: Date;
  handledAt: Date | null;
  handledByName: string | null;
  user: { id: string; name: string; email: string } | null;
}

export async function listPasswordResetRequests(opts: {
  status?: PasswordResetStatus;
  q?: string;
  skip: number;
  take: number;
}): Promise<{ rows: PasswordResetRequestRow[]; total: number }> {
  const where: Prisma.PasswordResetRequestWhereInput = {};
  if (opts.status) where.status = opts.status;
  if (opts.q) {
    where.OR = [
      { email: { contains: opts.q, mode: "insensitive" } },
      { user: { name: { contains: opts.q, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.passwordResetRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: opts.skip,
      take: opts.take,
      include: {
        user: { select: { id: true, name: true, email: true } },
        handledBy: { select: { name: true } },
      },
    }),
    prisma.passwordResetRequest.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      status: r.status,
      note: r.note,
      rejectReason: r.rejectReason,
      ip: r.ip,
      createdAt: r.createdAt,
      handledAt: r.handledAt,
      handledByName: r.handledBy?.name ?? null,
      user: r.user ? { id: r.user.id, name: r.user.name, email: r.user.email } : null,
    })),
    total,
  };
}

/** 在途申请数（后台侧栏角标 / 待办提示） */
export async function countPendingPasswordResets(): Promise<number> {
  return prisma.passwordResetRequest.count({ where: { status: "PENDING" } });
}

/**
 * 三态计数（后台统计卡）。
 *
 * 用一次 `groupBy` 而不是三次 `count`：后台每次刷新只发一个查询，
 * 且三者天然同快照，不会出现「待处理 3 / 已批准 2」读了两个时刻的错位。
 */
export async function countPasswordResetsByStatus(): Promise<Record<PasswordResetStatus, number>> {
  const rows = await prisma.passwordResetRequest.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts: Record<PasswordResetStatus, number> = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
  };
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

/* ─────────────────────────── ③ 批准 ─────────────────────────── */

export interface ApproveResetResult {
  tempPassword: string;
  email: string;
  name: string;
  /** 邮件通道是否已配置；false 时管理后台会提示「请手工转达」 */
  mailConfigured: boolean;
}

export async function approvePasswordResetRequest(input: {
  id: string;
  actorId: string;
  req?: NextRequest;
}): Promise<ApproveResetResult> {
  const request = await prisma.passwordResetRequest.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      userId: true,
      email: true,
      status: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!request) throw notFound("This password reset request does not exist");
  if (request.status !== "PENDING") {
    throw conflict("This password reset request has already been handled");
  }
  // 管理员不能给自己发临时密码（否则等于用别人的审批流重置自己的凭证）
  if (request.userId === input.actorId) {
    throw badRequest("You cannot handle your own password reset request");
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const now = new Date();

  // 账号更新与申请状态必须同事务：只改一半会出现「申请还挂着但密码已换」
  await prisma.$transaction([
    prisma.user.update({
      where: { id: request.userId },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: now },
    }),
    prisma.passwordResetRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        handledById: input.actorId,
        handledAt: now,
        rejectReason: null,
      },
    }),
  ]);

  // 临时密码生效那一刻，该用户所有旧会话必须作废（设备丢失场景的根本要求）
  await revokeAllUserTokens(request.userId);

  const loginUrl = `${env.SITE_URL}/auth/login`;
  await sendMail({
    to: request.email,
    template: "temp-password",
    data: { name: request.user.name, tempPassword, loginUrl },
  });

  await audit({
    userId: input.actorId,
    action: "ADMIN_PASSWORD_RESET_APPROVE",
    entity: "PasswordResetRequest",
    entityId: request.id,
    meta: { targetUserId: request.userId, targetEmail: request.email },
    req: input.req,
  });
  logger.info({ requestId: request.id, targetUserId: request.userId }, "找回密码申请已批准");

  return {
    tempPassword,
    email: request.email,
    name: request.user.name,
    mailConfigured: isMailConfigured(),
  };
}

/* ─────────────────────────── ④ 驳回 ─────────────────────────── */

export async function rejectPasswordResetRequest(input: {
  id: string;
  actorId: string;
  note?: string;
  req?: NextRequest;
}): Promise<{ email: string; name: string }> {
  const request = await prisma.passwordResetRequest.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      userId: true,
      email: true,
      status: true,
      user: { select: { name: true } },
    },
  });
  if (!request) throw notFound("This password reset request does not exist");
  if (request.status !== "PENDING") {
    throw conflict("This password reset request has already been handled");
  }

  const now = new Date();
  await prisma.passwordResetRequest.update({
    where: { id: request.id },
    data: {
      status: "REJECTED",
      handledById: input.actorId,
      handledAt: now,
      rejectReason: input.note?.trim() || null,
    },
  });

  // 联系表单页已于 2026-09-22 整体下线（公开表单无商业价值 + 灌水攻击面）：
  // 驳回后的求助入口改为「客服邮箱」直邮（一步到位），未配置邮箱时回落
  // FAQ 页 —— 该页首屏答案即展示客服邮箱，不会出现死链。
  const settings = await getSiteSettings().catch(() => null);
  const contactUrl = settings?.contactEmail
    ? `mailto:${settings.contactEmail}`
    : `${env.SITE_URL}/pages/faqs`;

  await sendMail({
    to: request.email,
    template: "reset-rejected",
    data: {
      name: request.user?.name ?? "",
      ...(input.note?.trim() ? { reason: input.note.trim() } : {}),
      contactUrl,
    },
  });

  await audit({
    userId: input.actorId,
    action: "ADMIN_PASSWORD_RESET_REJECT",
    entity: "PasswordResetRequest",
    entityId: request.id,
    meta: { targetUserId: request.userId, note: input.note ?? "" },
    req: input.req,
  });

  return { email: request.email, name: request.user?.name ?? "" };
}
