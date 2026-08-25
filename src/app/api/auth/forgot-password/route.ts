import { apiHandler, json, readJson } from "@/lib/api";
import { rateLimited } from "@/lib/errors";
import { signEmailToken } from "@/lib/auth/jwt";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, sha256 } from "@/lib/utils";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/** POST /api/auth/forgot-password — 发送重置邮件(防枚举) */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, forgotPasswordSchema);

  const rl = await rateLimit({ key: `forgot:${getClientIp(req)}`, limit: 3, windowSeconds: 60 });
  if (!rl.ok) throw rateLimited();

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (user) {
    const token = await signEmailToken(
      {
        sub: user.id,
        email: user.email,
        purpose: "reset-password",
        fp: (await sha256(user.passwordHash)).slice(0, 16),
      },
      "reset-password",
    );
    await sendMail({
      to: user.email,
      template: "reset-password",
      data: { name: user.name, link: `${env.SITE_URL}/auth/reset-password?token=${token}` },
    });
    await audit({ userId: user.id, action: "AUTH_FORGOT", entity: "User", entityId: user.id, req });
  }

  return json({ ok: true, message: "若该邮箱已注册，重置邮件已发送" });
});
