import { apiHandler, json, readJson } from "@/lib/api";
import { forbidden, rateLimited, unauthorized } from "@/lib/errors";
import { verifyPassword, DUMMY_PASSWORD_HASH } from "@/lib/auth/password";
import {
  clearPasswordChangeRequiredCookie,
  issueSession,
  setAuthCookies,
  setPasswordChangeRequiredCookie,
  toSessionUser,
} from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { getClientIp } from "@/lib/server/utils-server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/** POST /api/auth/login */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, loginSchema);

  // 账号级失败锁定：同一邮箱（跨 IP）连错 5 次锁 15 分钟，防分布式爆破
  const lockKey = `login-lock:${input.email.toLowerCase()}`;
  const lock = await rateLimit({ key: lockKey, ...RATE_LIMITS.loginLock });
  if (!lock.ok)
    throw rateLimited(
      "Too many failed attempts — this account is temporarily locked. Please try again in 15 minutes",
    );

  // 单标识+单账号 5 次/分钟 + 全站熔断 900 次/分钟（防轮换 IP 撞库横向扫多账号）
  const rl = await rateLimit({
    key: `login:${getClientIp(req)}:${input.email}`,
    ...RATE_LIMITS.loginAttempt,
  });
  if (!rl.ok) throw rateLimited();

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    // 防枚举（P2-5 商用审计）：对固定 dummy hash 跑一次同成本 bcrypt 校验，
    // 对齐「存在账号」的响应耗时 —— 此前秒级时间差可批量探测哪些邮箱已注册
    // （forgot-password 已防枚举，登录是最后一个缺口）。
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
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
  const res = json({ user: toSessionUser(user), mustChangePassword: user.mustChangePassword });
  setAuthCookies(res, tokens);
  // 临时密码首次登录：置位强制改密标记，由 proxy 把用户钉在改密页
  // （DB 侧 `requireUser()` 同步拦截所有业务接口，双保险见 lib/auth/session.ts）
  if (user.mustChangePassword) {
    setPasswordChangeRequiredCookie(res);
  } else {
    // 清除残留标记：另一台设备已完成改密、或中间件期间会话过期后重新登录时，
    // 否则旧 cookie 会把一个已经正常的账号死死钉在改密页
    clearPasswordChangeRequiredCookie(res);
  }
  await resetRateLimit(lockKey);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({
    userId: user.id,
    action: "AUTH_LOGIN",
    entity: "User",
    entityId: user.id,
    meta: user.mustChangePassword ? { mustChangePassword: true } : undefined,
    req,
  });
  return res;
});
