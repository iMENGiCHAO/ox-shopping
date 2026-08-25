import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { categoryReorderSchema } from "@/lib/validations/product";

export const runtime = "nodejs";

/** PUT /api/admin/categories/reorder — 分类排序 */
export const PUT = apiHandler(async (req) => {
  const actor = await requireStaff();
  const input = await readJson(req, categoryReorderSchema);

  await prisma.$transaction(
    input.orderedIds.map((cid, i) =>
      prisma.category.update({ where: { id: cid }, data: { sortOrder: i } }),
    ),
  );

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_CATEGORY_REORDER",
    entity: "Category",
    meta: { orderedIds: input.orderedIds },
    req,
  });
  return json({ ok: true });
});
