import { apiHandler, json, searchParam } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { badRequest } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getAdminRelations } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * GET /api/admin/distribution/relations?userId=xxx — 关系链查询
 * 不传 userId 时按邮箱/推广码反查（后台输入框两种都能填）。
 */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  let userId = searchParam(sp, "userId");
  const q = searchParam(sp, "q");

  if (!userId && q) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: { equals: q, mode: "insensitive" } }, { referralCode: q.toUpperCase() }],
      },
      select: { id: true },
    });
    if (!user) return json({ found: false, relations: null });
    userId = user.id;
  }
  if (!userId) throw badRequest("请提供 userId 或 q（邮箱/推广码）");

  const relations = await getAdminRelations(userId);
  return json({ found: relations.user !== null, relations });
});
