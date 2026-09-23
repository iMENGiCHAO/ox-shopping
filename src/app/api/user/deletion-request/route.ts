import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { conflict } from "@/lib/errors";
import { notifyAdmins } from "@/server/services/notification.service";
import { dataDeletionSchema } from "@/lib/validations/admin";

export const runtime = "nodejs";

/**
 * POST /api/user/deletion-request — 数据删除请求（注销申请）
 * 闭环：置 deletionRequestedAt（状态可查、防重复提交）→ 审计 → 确认邮件 →
 *       管理员站内通知（admin 在后台通知中心可见，随后在 /admin/users 处理）。
 * 处理动作见 POST /api/admin/users/[id]/deletion（确认注销=匿名化 / 驳回）。
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, dataDeletionSchema);

  // 一个账号同一时间只能有一份在途申请（重复提交直接 409）
  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { deletionRequestedAt: true },
  });
  if (existing?.deletionRequestedAt) {
    throw conflict(
      "You already have a pending account-deletion request. To withdraw it, cancel the current request first",
    );
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { deletionRequestedAt: now },
  });

  await audit({
    userId: user.id,
    action: "DATA_DELETION_REQUEST",
    entity: "User",
    entityId: user.id,
    meta: { reason: input.reason ?? "" },
    req,
  });
  await sendMail({ to: user.email, template: "data-deletion", data: { name: user.name } });

  // 后台衔接：管理员通知中心立即可见（大爷指正——申请不能只躺在审计日志里）
  const notified = await notifyAdmins({
    type: "system",
    title: "客户申请注销账户",
    titleEn: "Customer requested account deletion",
    body: "有客户提交了账户注销申请，请在客户管理中通过用户标识核对：确认注销（匿名化删除）或驳回。",
    bodyEn:
      "A customer requested account deletion. Review it in User Management by user ID: approve (anonymized deletion) or reject.",
    link: "/admin/users",
    meta: { userId: user.id },
  });

  return json({ ok: true, deletionRequestedAt: now.toISOString(), adminsNotified: notified });
});

/**
 * DELETE /api/user/deletion-request — 撤回注销申请（处理完成前用户可反悔）
 * 审计留痕；admin 处理完成后此字段已被清空，撤回自然无效（404 语义按 400 处理）。
 */
export const DELETE = apiHandler(async (req) => {
  const user = await requireUser();

  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { deletionRequestedAt: true },
  });
  if (!existing?.deletionRequestedAt) {
    throw conflict("There is no pending account-deletion request to withdraw");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { deletionRequestedAt: null },
  });

  await audit({
    userId: user.id,
    action: "DATA_DELETION_CANCEL",
    entity: "User",
    entityId: user.id,
    req,
  });

  return json({ ok: true });
});
