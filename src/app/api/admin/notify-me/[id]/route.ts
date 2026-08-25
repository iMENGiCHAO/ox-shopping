import { apiHandler, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";

export const runtime = "nodejs";

/** DELETE /api/admin/notify-me/[id] */
export const DELETE = apiHandler(async (req, ctx) => {
  await requireStaff();
  const { id } = ctx.params;
  await prisma.notifyMe.delete({ where: { id: String(id) } });
  return json({ data: { ok: true } });
});
