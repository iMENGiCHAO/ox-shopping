import { apiHandler, json, readJson } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { requireAdmin, revokeAllUserTokens } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { adminResetPasswordSchema } from "@/lib/validations/admin";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** PUT /api/admin/users/[id]/password — 管理员重置用户密码 */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, adminResetPasswordSchema);

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFound("用户不存在");

  const passwordHash = await hashPassword(input.password);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  // 密码重置后，该用户所有会话失效，需重新登录
  await revokeAllUserTokens(id);

  await audit({
    userId: actor.id,
    action: "ADMIN_USER_RESET_PASSWORD",
    entity: "User",
    entityId: id,
    req,
  });

  return json({ ok: true });
});
