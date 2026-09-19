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
