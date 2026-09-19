import { apiHandler, json } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { signEmailToken } from "@/lib/auth/jwt";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/auth/verify-email/resend — 登录用户重发验证邮件
 *
 * 注册时的验证邮件依赖邮件服务（Resend/SMTP/console），服务抖动或收件被吞时，
 * 用户走这里补发，而不是永远卡在「未验证」。已验证过的邮箱直接 400。
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();

  // 限流：每用户 3 次 / 10 分钟（防滥用邮件通道）
  const rl = await rateLimit({ key: `verify-resend:${user.id}`, limit: 3, windowSeconds: 600 });
  if (!rl.ok) throw badRequest("Too many requests, please try again later");

  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fresh) throw badRequest("Account not found");
  if (fresh.emailVerified) throw badRequest("This email is already verified");

  const emailToken = await signEmailToken(
    { sub: fresh.id, email: fresh.email, purpose: "verify-email" },
    "verify-email",
  );
  await sendMail({
    to: fresh.email,
    template: "verify-email",
    data: { name: fresh.name, link: `${env.SITE_URL}/auth/verify-email?token=${emailToken}` },
  });

  await audit({
    userId: fresh.id,
    action: "EMAIL_VERIFY_RESEND",
    entity: "User",
    entityId: fresh.id,
    req,
  });

  return json({ ok: true });
});
