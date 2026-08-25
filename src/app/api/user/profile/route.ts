import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser, toSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { updateProfileSchema } from "@/lib/validations/auth";

export const runtime = "nodejs";

/** GET /api/user/profile */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json({ user });
});

/** PUT /api/user/profile — 更新昵称 */
export const PUT = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, updateProfileSchema);

  const updated = await prisma.user.update({ where: { id: user.id }, data: { name: input.name } });
  await audit({
    userId: user.id,
    action: "USER_UPDATE_PROFILE",
    entity: "User",
    entityId: user.id,
    meta: { name: input.name },
    req,
  });
  return json({ user: toSessionUser(updated) });
});
