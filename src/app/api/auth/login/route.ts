import { apiHandler, json, readJson } from "@/lib/api";
import { forbidden, rateLimited, unauthorized } from "@/lib/errors";
import { verifyPassword } from "@/lib/auth/password";
import { issueSession, setAuthCookies, toSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/** POST /api/auth/login */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, loginSchema);

  const rl = await rateLimit({
    key: `login:${getClientIp(req)}:${input.email}`,
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.ok) throw rateLimited();

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    await audit({ action: "AUTH_LOGIN_FAILED", meta: { email: input.email }, req });
    throw unauthorized("邮箱或密码错误");
  }
  if (user.status === "DISABLED") throw forbidden("账号已被禁用");

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    await audit({
      userId: user.id,
      action: "AUTH_LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      req,
    });
    throw unauthorized("邮箱或密码错误");
  }

  const tokens = await issueSession(user);
  const res = json({ user: toSessionUser(user) });
  setAuthCookies(res, tokens);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "AUTH_LOGIN", entity: "User", entityId: user.id, req });
  return res;
});
