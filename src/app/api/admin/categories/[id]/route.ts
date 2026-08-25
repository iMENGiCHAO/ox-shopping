import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { categoryUpdateSchema } from "@/lib/validations/product";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** PUT /api/admin/categories/[id] */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFound("分类不存在");
  const input = await readJson(req, categoryUpdateSchema);

  // 不能把 parentId 设为自身或其后代(防循环)
  if (input.parentId) {
    if (input.parentId === id) throw badRequest("不能将分类设为自身的子分类");
    let cursor: string | null = input.parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      if (cursor === id) throw badRequest("不能将分类移动到自己的子分类下");
      const parent: { parentId: string | null } | null = await prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
  }

  if (input.slug && input.slug !== existing.slug) {
    const dup = await prisma.category.findFirst({ where: { slug: input.slug, id: { not: id } } });
    if (dup) throw conflict("slug 已存在");
  }

  const category = await prisma.category.update({ where: { id }, data: input });

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_CATEGORY_UPDATE",
    entity: "Category",
    entityId: id,
    req,
  });
  return json({ category });
});

/** DELETE /api/admin/categories/[id] */
export const DELETE = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);

  const existing = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } }, children: true },
  });
  if (!existing) throw notFound("分类不存在");
  if (existing._count.products > 0 || existing.children.length > 0) {
    throw badRequest("分类下存在商品或子分类，无法删除");
  }

  await prisma.category.delete({ where: { id } });

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_CATEGORY_DELETE",
    entity: "Category",
    entityId: id,
    req,
  });
  return json({ ok: true });
});
