import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllUserTokens } from "@/lib/auth/session";
import { verifyEmailToken } from "@/lib/auth/jwt";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/** POST /api/auth/reset-password */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, resetPasswordSchema);

  const payload = await verifyEmailToken(input.token, "reset-password");
  if (!payload) throw badRequest("重置链接无效或已过期");

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw badRequest("重置链接无效或已过期");

  // 密码指纹校验：密码已变更过则旧重置链接失效
  if (payload.fp && payload.fp !== (await sha256(user.passwordHash)).slice(0, 16)) {
    throw badRequest("重置链接已失效，请重新申请");
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await revokeAllUserTokens(user.id);

  await audit({ userId: user.id, action: "AUTH_RESET", entity: "User", entityId: user.id, req });
  return json({ ok: true });
});
