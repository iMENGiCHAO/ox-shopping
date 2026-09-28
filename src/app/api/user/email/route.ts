import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, conflict, rateLimited, unauthorized } from "@/lib/errors";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { rateLimit } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { issueSession, requireUser, revokeAllUserTokens, setAuthCookies } from "@/lib/auth/session";
import { signEmailToken } from "@/lib/auth/jwt";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { changeEmailSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/**
 * PUT /api/user/email — 修改登录账号(邮箱)
 * 流程：验证当前密码 → 邮箱唯一性校验 → 更新并重置验证状态 →
 *       吊销全部旧会话 → 用新邮箱重签会话保持登录 → 发送验证邮件(未配置邮件服务时仅记录日志)
 */
export const PUT = apiHandler(async (req) => {
  const user = await requireUser();
  // 安全审计 D4：同改密 —— 换邮箱的口令复核此前零限流，猜中即账号接管
  const rl = await rateLimit({ key: `email-verify:${user.id}`, ...RATE_LIMITS.passwordVerify });
  if (!rl.ok) throw rateLimited("Too many attempts, please try again later");
  const input = await readJson(req, changeEmailSchema);

  const full = await prisma.user.findUnique({ where: { id: user.id } });
  if (!full) throw unauthorized();

  const ok = await verifyPassword(input.currentPassword, full.passwordHash);
  if (!ok) throw badRequest("Current password is incorrect");

  if (input.newEmail === full.email)
    throw badRequest("The new email is the same as your current email");

  const taken = await prisma.user.findUnique({ where: { email: input.newEmail } });
  if (taken) throw conflict("This email is already used by another account");

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { email: input.newEmail, emailVerified: false },
  });

  // 验证邮件：与注册流程一致(未配置 SMTP 时由邮件模块记录到服务端日志)
  const emailToken = await signEmailToken(
    { sub: updated.id, email: updated.email, purpose: "verify-email" },
    "verify-email",
  );
  await sendMail({
    to: updated.email,
    template: "verify-email",
    data: { name: updated.name, link: `${env.SITE_URL}/auth/verify-email?token=${emailToken}` },
  }).catch(() => undefined);

  // 旧邮箱会话全部失效，用新邮箱重签，保持当前设备登录
  await revokeAllUserTokens(user.id);
  const tokens = await issueSession(updated);
  const res = json({ user: { id: updated.id, email: updated.email, name: updated.name } });
  setAuthCookies(res, tokens);

  await audit({
    userId: user.id,
    action: "USER_CHANGE_EMAIL",
    entity: "User",
    entityId: user.id,
    meta: { changed: true },
    req,
  });
  return res;
});
