import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, rateLimited, unauthorized } from "@/lib/errors";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { rateLimit } from "@/lib/rate-limit";
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
  // 安全审计 D4：当前口令复核此前零限流 —— 拿到会话后可无限在线猜测当前口令
  // （实测连续 13 次错误仅 400 无 429）。5 次/15 分钟，按用户计。
  const rl = await rateLimit({ key: `pwd-verify:${user.id}`, ...RATE_LIMITS.passwordVerify });
  if (!rl.ok) throw rateLimited("Too many attempts, please try again later");
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
