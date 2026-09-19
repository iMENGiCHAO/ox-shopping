import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, rateLimited } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllUserTokens } from "@/lib/auth/session";
import { verifyEmailToken } from "@/lib/auth/jwt";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/server/utils-server";
import { sha256 } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/** POST /api/auth/reset-password */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, resetPasswordSchema);

  // 防暴力尝试：同 IP 每小时最多 10 次重置提交
  const rl = await rateLimit({ key: `reset-pw:${getClientIp(req)}`, limit: 10, windowSeconds: 3600 });
  if (!rl.ok) throw rateLimited();

  const payload = await verifyEmailToken(input.token, "reset-password");
  if (!payload) throw badRequest("This reset link is invalid or has expired");

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw badRequest("This reset link is invalid or has expired");

  // 密码指纹校验：密码已变更过则旧重置链接失效
  if (payload.fp && payload.fp !== (await sha256(user.passwordHash)).slice(0, 16)) {
    throw badRequest("This reset link has expired. Please request a new one");
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await revokeAllUserTokens(user.id);

  await audit({ userId: user.id, action: "AUTH_RESET", entity: "User", entityId: user.id, req });
  return json({ ok: true });
});
