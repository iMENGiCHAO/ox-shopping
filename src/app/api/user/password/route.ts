import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, unauthorized } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  clearPasswordChangeRequiredCookie,
  issueSession,
  requireUserAllowingPendingPasswordChange,
  revokeAllUserTokens,
  setAuthCookies,
} from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/**
 * PUT /api/user/password — 修改密码（保持登录）
 *
 * 兼任「临时密码首次改密」的出口（B-2）：
 *   - 用 `requireUserAllowingPendingPasswordChange` 而不是 `requireUser` ——
 *     被强制改密的用户正是唯一需要调用本接口的人，用 requireUser 会自我锁死；
 *   - 成功后同时清 `mustChangePassword` 与强制改密 cookie，
 *     否则用户改完密码仍会被中间件钉回改密页；
 *   - 审计动作按来路区分（强制改密 vs 主动改密），风控可据此识别找回密码链路。
 */
export const PUT = apiHandler(async (req) => {
  const user = await requireUserAllowingPendingPasswordChange();
  const input = await readJson(req, changePasswordSchema);

  const full = await prisma.user.findUnique({ where: { id: user.id } });
  if (!full) throw unauthorized();

  const ok = await verifyPassword(input.currentPassword, full.passwordHash);
  if (!ok) throw badRequest("Current password is incorrect");

  // 新密码等于旧密码：等于「改了个寂寞」，且强制改密场景下等于绕过改密要求
  if (input.newPassword === input.currentPassword) {
    throw badRequest("The new password must be different from the current password");
  }

  const wasForced = full.mustChangePassword;
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
  });
  await revokeAllUserTokens(user.id);

  // 重新签发会话，保持登录状态
  const tokens = await issueSession(full);
  const res = json({ ok: true, mustChangePassword: false });
  setAuthCookies(res, tokens);
  clearPasswordChangeRequiredCookie(res);

  await audit({
    userId: user.id,
    action: wasForced ? "USER_PASSWORD_CHANGE_FORCED" : "USER_CHANGE_PASSWORD",
    entity: "User",
    entityId: user.id,
    meta: { forced: wasForced },
    req,
  });
  return res;
});
