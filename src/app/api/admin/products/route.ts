import { apiHandler, json, jsonPaginated, readJson, searchParam } from "@/lib/api";
import { conflict } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { serializeProduct } from "@/server/serializers";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
import { productCreateSchema } from "@/lib/validations/product";
import type { ProductStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const PRODUCT_STATUSES: ProductStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

function slugifyName(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return s || "product";
}

async function uniqueProductSlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (await prisma.product.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

/** GET /api/admin/products */
export const GET = apiHandler(async (req) => {
  await requireStaff();
  const sp = new URL(req.url).searchParams;
  const q = searchParam(sp, "q");
  const status = searchParam(sp, "status");
  const categoryId = searchParam(sp, "categoryId");
  const { page, pageSize, skip, take } = parsePagination(sp);

  const where: Prisma.ProductWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
    ];
  }
  if (status && (PRODUCT_STATUSES as string[]).includes(status)) {
    where.status = status as ProductStatus;
  }
  if (categoryId) where.categoryId = categoryId;

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);

  return jsonPaginated(rows.map(serializeProduct), {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});

/** POST /api/admin/products */
export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  const input = await readJson(req, productCreateSchema);

  const skuExists = await prisma.product.findUnique({ where: { sku: input.sku } });
  if (skuExists) throw conflict("SKU 已存在");

  const slug = await uniqueProductSlug(input.slug ?? slugifyName(input.name));

  const product = await prisma.product.create({
    data: {
      name: input.name,
      slug,
      sku: input.sku,
      price: input.price,
      isPresale: input.isPresale ?? false,
      stock: (() => {
        const first = input.specStock ? Object.values(input.specStock)[0] : undefined;
        if (!first) return input.stock;
        const counts = Object.values(first as Record<string, number>);
        return counts.length > 0 ? counts.reduce((a, b) => a + b, 0) : input.stock;
      })(),
      isNew: input.isNew ?? false,
      isHot: input.isHot ?? false,
      sizeChart: input.sizeChart ?? Prisma.DbNull,
      specStock: input.specStock ?? Prisma.DbNull,
      categoryId: input.categoryId,
      description: input.description ?? "",
      status: input.status ?? "DRAFT",
      compareAtPrice: input.compareAtPrice ?? null,
      costPrice: input.costPrice ?? null,
      images: input.images ?? [],
      attributes: input.attributes ?? [],
    },
    include: { category: true },
  });

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_PRODUCT_CREATE",
    entity: "Product",
    entityId: product.id,
    meta: { name: product.name, sku: product.sku },
    req,
  });
  return json({ product: serializeProduct(product) });
});
