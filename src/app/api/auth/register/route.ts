import { apiHandler, json, readJson } from "@/lib/api";
import { conflict, rateLimited } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { issueSession, setAuthCookies, toSessionUser } from "@/lib/auth/session";
import { signEmailToken } from "@/lib/auth/jwt";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/server/utils-server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { notifyAdmins } from "@/server/services/notification.service";

export const runtime = "nodejs";

/** POST /api/auth/register — 注册并直接登录 */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, registerSchema);

  const rl = await rateLimit({ key: `register:${getClientIp(req)}`, limit: 3, windowSeconds: 60 });
  if (!rl.ok) throw rateLimited();

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("该邮箱已注册");

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
  await sendMail({
    to: user.email,
    template: "verify-email",
    data: { name: user.name, link: `${env.SITE_URL}/auth/verify-email?token=${emailToken}` },
  });

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

  return res;
});
