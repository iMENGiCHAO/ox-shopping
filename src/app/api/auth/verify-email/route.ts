import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { verifyEmailToken } from "@/lib/auth/jwt";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { verifyEmailSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/** POST /api/auth/verify-email */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, verifyEmailSchema);

  const payload = await verifyEmailToken(input.token, "verify-email");
  if (!payload) throw badRequest("This verification link is invalid or has expired");

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  // 安全审计：令牌必须与**当前**邮箱绑定。此前只取 payload.sub —— 用户换邮箱后
  // （user/email 路由会重置 emailVerified=false），旧邮箱收到的旧链接仍能把账号
  // 重新置为已验证，绕过「未验证不得下单」门控（24h 有效期内可重放）。
  if (user && payload.email && payload.email.toLowerCase() !== user.email.toLowerCase()) {
    throw badRequest("This verification link is invalid or has expired");
  }
  if (user && !user.emailVerified) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  }

  await audit({
    userId: user?.id,
    action: "AUTH_EMAIL_VERIFY",
    entity: "User",
    entityId: user?.id,
    req,
  });
  return json({ ok: true });
});
