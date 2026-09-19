import { apiHandler, json, readJson } from "@/lib/api";
import { forbidden, rateLimited, unauthorized } from "@/lib/errors";
import { verifyPassword } from "@/lib/auth/password";
import { issueSession, setAuthCookies, toSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/server/utils-server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/** POST /api/auth/login */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, loginSchema);

  // 账号级失败锁定：同一邮箱（跨 IP）连错 5 次锁 15 分钟，防分布式爆破
  const lockKey = `login-lock:${input.email.toLowerCase()}`;
  const lock = await rateLimit({ key: lockKey, limit: 5, windowSeconds: 900 });
  if (!lock.ok) throw rateLimited("Too many failed attempts — this account is temporarily locked. Please try again in 15 minutes");

  const rl = await rateLimit({
    key: `login:${getClientIp(req)}:${input.email}`,
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.ok) throw rateLimited();

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    await audit({ action: "AUTH_LOGIN_FAILED", meta: { email: input.email }, req });
    throw unauthorized("Incorrect email or password");
  }
  if (user.status === "DISABLED") throw forbidden("This account has been disabled");

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    await audit({
      userId: user.id,
      action: "AUTH_LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      req,
    });
    throw unauthorized("Incorrect email or password");
  }

  // 后台登录入口:非员工账号直接拒绝,不建立任何 session
  if (input.scope === "admin" && user.role !== "ADMIN" && user.role !== "SUPPORT") {
    await audit({
      userId: user.id,
      action: "AUTH_ADMIN_DENIED",
      entity: "User",
      entityId: user.id,
      meta: { email: input.email },
      req,
    });
    throw forbidden("This account does not have admin access");
  }

  const tokens = await issueSession(user);
  const res = json({ user: toSessionUser(user) });
  setAuthCookies(res, tokens);
  await resetRateLimit(lockKey);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "AUTH_LOGIN", entity: "User", entityId: user.id, req });
  return res;
});
