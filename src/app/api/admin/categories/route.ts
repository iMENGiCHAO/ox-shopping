import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { categoryCreateSchema } from "@/lib/validations/product";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

function slugifyName(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return s || "category";
}

async function uniqueCategorySlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (await prisma.category.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

type CategoryWithChildren = Prisma.CategoryGetPayload<{
  include: { _count: { select: { products: true } } };
}> & { children: CategoryWithChildren[] };

/** GET /api/admin/categories — 全部分类(含未启用)树形结构 */
export const GET = apiHandler(async () => {
  await requireStaff();
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { products: true } } },
  });

  const byParent = new Map<string, CategoryWithChildren[]>();
  for (const c of categories) {
    const list = byParent.get(c.parentId ?? "") ?? [];
    list.push({ ...c, children: [] });
    byParent.set(c.parentId ?? "", list);
  }
  const tree = (byParent.get("") ?? []).map((c) => ({
    ...c,
    children: byParent.get(c.id) ?? [],
  }));

  return json({ categories: tree });
});

/** POST /api/admin/categories */
export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  const input = await readJson(req, categoryCreateSchema);

  const slug = await uniqueCategorySlug(input.slug ?? slugifyName(input.name));

  const category = await prisma.category.create({
    data: { ...input, slug },
  });

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_CATEGORY_CREATE",
    entity: "Category",
    entityId: category.id,
    meta: { name: category.name },
    req,
  });
  return json({ category });
});
