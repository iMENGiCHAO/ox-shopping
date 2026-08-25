import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, unauthorized } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { issueSession, requireUser, revokeAllUserTokens, setAuthCookies } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/** PUT /api/user/password — 修改密码(保持登录) */
export const PUT = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, changePasswordSchema);

  const full = await prisma.user.findUnique({ where: { id: user.id } });
  if (!full) throw unauthorized();

  const ok = await verifyPassword(input.currentPassword, full.passwordHash);
  if (!ok) throw badRequest("当前密码不正确");

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await revokeAllUserTokens(user.id);

  // 重新签发会话，保持登录状态
  const tokens = await issueSession(full);
  const res = json({ ok: true });
  setAuthCookies(res, tokens);

  await audit({
    userId: user.id,
    action: "USER_CHANGE_PASSWORD",
    entity: "User",
    entityId: user.id,
    req,
  });
  return res;
});
