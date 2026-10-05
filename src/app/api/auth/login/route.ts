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
import { logger } from "@/lib/logger";
import { peekRateLimit, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { getClientIp } from "@/lib/server/utils-server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/**
 * 口令失败后的账号级锁定（peek + 失败后才 hit，两层）：
 *  - 硬锁 `login-lock:${ip}:${email}`：只锁攻击者自己的 IP 组合（5 次/15 分钟）；
 *  - 节流 `login-throttle:${email}`：跨 IP 兜底（10 次/15 分钟硬锁，此前指数延迟）。
 * 两层都只在「账号存在且口令错误」后递增 —— 未知邮箱探测烧不动计数器，
 * 被上游限流拒绝的请求同样不烧（安全审计：旧实现请求进门即计数，且键为纯邮箱）。
 */
async function countLoginFailure(ip: string, emailKey: string): Promise<void> {
  await Promise.all([
    rateLimit({
      key: `login-lock:${ip}:${emailKey}`,
      ...RATE_LIMITS.loginLock,
    }),
    rateLimit({
      key: `login-throttle:${emailKey}`,
      ...RATE_LIMITS.loginThrottle,
    }),
  ]);
}

/** POST /api/auth/login */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, loginSchema);
  const ip = getClientIp(req);
  const emailKey = input.email.toLowerCase();
  const lockKey = `login-lock:${ip}:${emailKey}`;
  const throttleKey = `login-throttle:${emailKey}`;

  // ① 硬锁（只读检查）：同 IP×邮箱 已达 5 次真实口令失败 → 拒绝，不再跑 bcrypt
  const lock = await peekRateLimit(
    lockKey,
    RATE_LIMITS.loginLock.limit,
    RATE_LIMITS.loginLock.windowSeconds,
  );
  if (!lock.ok)
    throw rateLimited(
      "Too many failed attempts — this account is temporarily locked. Please try again in 15 minutes",
    );

  // ② 单标识+单账号 5 次/分钟 + 全站熔断 900 次/分钟（防轮换 IP 撞库横向扫多账号）
  const rl = await rateLimit({
    key: `login:${ip}:${input.email}`,
    ...RATE_LIMITS.loginAttempt,
  });
  if (!rl.ok) throw rateLimited();

  // ③ 跨 IP 节流（只读检查）：邮箱维度已有 N 次真实失败 →
  //    a. N≥10 硬锁（分布式爆破必须可阻断，纯延迟会被并行绕过）；
  //    b. N≥4 起响应前追加指数延迟（0.5s→10s 封顶）—— 定向攻击成本指数上升，
  //       而受害者本人正常登录最多多等一次几秒，不构成拒绝服务。
  const throttle = await peekRateLimit(
    throttleKey,
    RATE_LIMITS.loginThrottle.limit,
    RATE_LIMITS.loginThrottle.windowSeconds,
  );
  if (!throttle.ok) {
    logger.warn({ email: emailKey, count: throttle.count }, "登录邮箱级节流硬锁触发（疑似爆破或定向 DoS）");
    throw rateLimited(
      "Too many failed attempts — this account is temporarily locked. Please try again in 15 minutes",
    );
  }
  if (throttle.count >= 4) {
    const delayMs = Math.min(500 * 2 ** (throttle.count - 3), 10_000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    // 防枚举（P2-5 商用审计）：对固定 dummy hash 跑一次同成本 bcrypt 校验，
    // 对齐「存在账号」的响应耗时 —— 此前秒级时间差可批量探测哪些邮箱已注册
    // （forgot-password 已防枚举，登录是最后一个缺口）。
    // 注意：不烧任何失败计数（账号不存在，没有可被锁的对象）。
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
    await audit({ action: "AUTH_LOGIN_FAILED", meta: { email: input.email }, req });
    throw unauthorized("Incorrect email or password");
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    // 只有「账号存在且口令错误」才计失败（见 countLoginFailure 注释）
    await countLoginFailure(ip, emailKey);
    await audit({
      userId: user.id,
      action: "AUTH_LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      req,
    });
    throw unauthorized("Incorrect email or password");
  }

  // 账号禁用检查必须在 verifyPassword **之后**（安全审计修复）：
  // 此前它在口令校验前直接 403，等于向任意人（无需口令）暴露
  // 「该邮箱已注册且被禁用」的枚举预言机 + 免 bcrypt 的时间侧信道。
  // 现在只有持正确口令的人才能看到 403 —— 与「口令错误」的 401 不可区分。
  if (user.status === "DISABLED") throw forbidden("This account has been disabled");

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
  // 登录成功：清除两层失败计数（受害者正常登录不该继承攻击者烧出的延迟）
  await Promise.all([resetRateLimit(lockKey), resetRateLimit(throttleKey)]);

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
