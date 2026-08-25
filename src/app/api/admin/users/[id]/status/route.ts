import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { requireAdmin, revokeAllUserTokens, toSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { userStatusSchema } from "@/lib/validations/admin";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** PUT /api/admin/users/[id]/status */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, userStatusSchema);

  if (id === actor.id && input.status === "DISABLED") {
    throw badRequest("不能禁用自己的账号");
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("用户不存在");

  const updated = await prisma.user.update({
    where: { id },
    data: { status: input.status },
  });
  if (input.status === "DISABLED") {
    await revokeAllUserTokens(id);
  }

  await audit({
    userId: actor.id,
    action: "ADMIN_USER_STATUS",
    entity: "User",
    entityId: id,
    meta: { to: input.status },
    req,
  });
  return json({ user: toSessionUser(updated) });
});
