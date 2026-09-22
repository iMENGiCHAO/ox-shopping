import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, conflict, rateLimited } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { issueSession, setAuthCookies, toSessionUser } from "@/lib/auth/session";
import { signEmailToken } from "@/lib/auth/jwt";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { getClientIp } from "@/lib/server/utils-server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { notifyAdmins } from "@/server/services/notification.service";
import { distributionBridge } from "@/server/services/distribution/bridge";
import { DIST_REF_COOKIE } from "@/lib/distribution/contract";

export const runtime = "nodejs";

/** POST /api/auth/register — 注册并直接登录 */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, registerSchema);

  // 蜜罐拦截：隐藏字段被填 = 脚本自动提交，按普通校验失败口径静默拒绝（不暴露拦截原因）
  if (input.company) {
    throw badRequest("Invalid registration details, please refresh the page and try again");
  }

  // 双层限流：单 IP 3 次/分钟（防单点刷）+ 全站熔断 100 次/小时（防 IP 池批量灌水）。
  // 熔断只对「通过单桶检查」的请求计数，避免单个 IP 把全站额度当成锁死端点的武器。
  const rl = await rateLimit({
    key: `register:${getClientIp(req)}`,
    ...RATE_LIMITS.register,
  });
  if (!rl.ok) throw rateLimited();

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("This email is already registered");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash, role: "CUSTOMER" },
  });

  const tokens = await issueSession(user);
  const res = json({ user: toSessionUser(user) });
  setAuthCookies(res, tokens);

  const emailToken = await signEmailToken(
    { sub: user.id, email: user.email, purpose: "verify-email" },
    "verify-email",
  );
  // 邮件服务异常不能让注册 500（用户已创建、会话已发）——降级为审计记录，
  // 用户可在登录后通过重发接口补发（POST /api/auth/verify-email/resend）
  try {
    await sendMail({
      to: user.email,
      template: "verify-email",
      data: { name: user.name, link: `${env.SITE_URL}/auth/verify-email?token=${emailToken}` },
    });
  } catch (mailErr) {
    await audit({
      userId: user.id,
      action: "EMAIL_SEND_FAILED",
      entity: "User",
      entityId: user.id,
      meta: { template: "verify-email", reason: String(mailErr).slice(0, 200) },
      req,
    });
  }

  await audit({ userId: user.id, action: "AUTH_REGISTER", entity: "User", entityId: user.id, req });

  // 站内消息：通知所有管理员有新用户注册（不静默）
  void notifyAdmins({
    type: "system",
    title: "新用户注册",
    titleEn: "New user registered",
    body: `新用户 ${user.name}（${user.email}）刚刚注册。`,
    bodyEn: `New user ${user.name} (${user.email}) just registered.`,
    link: "/admin/users",
    meta: { userId: user.id, email: user.email },
  });

  // 分销（隔离模块）：按推广 cookie 绑定推广人 —— 走 bridge 接口，
  // 内部自带开关与异常隔离，分销出任何问题都不会影响注册结果。
  await distributionBridge.onUserRegistered({
    userId: user.id,
    refCookie: req.cookies.get(DIST_REF_COOKIE)?.value ?? null,
    req,
  });

  return res;
});
