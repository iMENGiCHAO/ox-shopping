import { aggregateTrackedStock } from "@/server/services/spec-stock";
import { getSiteSettings } from "@/server/services/settings.service";
import { apiHandler, json, jsonPaginated, readJson, searchParam } from "@/lib/api";
import { conflict } from "@/lib/errors";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { serializeProduct } from "@/server/serializers";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { variantSignature } from "@/server/services/variant-stock";
import { parsePagination } from "@/lib/utils";
import { productCreateSchema } from "@/lib/validations/product";
import { sanitizeHtml } from "@/lib/sanitize";
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
  // 低库存筛选（运营口径）：?stock=low → stock ≤ 生效阈值（与仪表盘计数同源）
  const stockFilter = searchParam(sp, "stock");
  const { page, pageSize, skip, take } = parsePagination(sp);
  const { lowStockThreshold } = await getSiteSettings();

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
  if (stockFilter === "low") where.stock = { lte: lowStockThreshold };

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

  return jsonPaginated(
    rows.map(serializeProduct),
    {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
    undefined,
    // 生效阈值随列表下发：前端高亮/口径展示用，不再各自写死 5
    { lowStockThreshold },
  );
});

/** POST /api/admin/products */
export const POST = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, productCreateSchema);

  const skuExists = await prisma.product.findUnique({ where: { sku: input.sku } });
  if (skuExists) throw conflict("SKU 已存在");

  const slug = await uniqueProductSlug(
    input.slug ?? slugifyName(input.nameEn?.trim() || input.name),
  );

  // 净化 description：去除危险 HTML（管理端富文本可能被注入恶意脚本）
  const safeDescription = input.description ? await sanitizeHtml(input.description) : "";

  const product = await prisma.product.create({
    data: {
      name: input.name,
      nameEn: input.nameEn?.trim() || null,
      slug,
      sku: input.sku,
      price: input.price,
      isPresale: input.isPresale ?? false,
      // 留空 = null（前端会用站级默认）；非空 = 覆盖
      presaleNoteZh: input.presaleNoteZh?.trim() || null,
      presaleNoteEn: input.presaleNoteEn?.trim() || null,
      stock: aggregateTrackedStock(input.specStock) ?? input.stock,
      isNew: input.isNew ?? false,
      isHot: input.isHot ?? false,
      sizeChart: input.sizeChart ?? Prisma.DbNull,
      specStock: input.specStock ?? Prisma.DbNull,
      // SKU 矩阵：组合粒度库存（非空时前台只列真实组合）；商品级 stock = Σ 变体
      ...(input.variants && input.variants.length > 0
        ? {
            stock: input.variants.reduce((sum, v) => sum + v.stock, 0),
            variants: {
              create: input.variants.map((v) => ({
                attributes: v.attributes as unknown as Prisma.InputJsonValue,
                signature: variantSignature(v.attributes),
                stock: v.stock,
                price: v.price != null ? new Prisma.Decimal(v.price.toFixed(2)) : null,
                sku: v.sku?.trim() || null,
                image: v.image?.trim() || null,
                isActive: v.isActive,
              })),
            },
          }
        : {}),
      categoryId: input.categoryId,
      description: safeDescription,
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
