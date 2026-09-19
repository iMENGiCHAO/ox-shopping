import { apiHandler, json, readJson } from "@/lib/api";
import { conflict } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { getProductById } from "@/server/services/product.service";
import { notifyRestock } from "@/server/services/notify-me.service";
import { aggregateTrackedStock } from "@/server/services/spec-stock";
import { serializeProduct } from "@/server/serializers";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { productUpdateSchema } from "@/lib/validations/product";
import { routeParam } from "@/app/api/_lib/params";
import { sanitizeHtml } from "@/lib/sanitize";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** GET /api/admin/products/[id] — 商品详情 */
export const GET = apiHandler(async (req, ctx) => {
  await requireStaff();
  const id = routeParam(ctx.params.id);
  const product = await getProductById(id);

  return json({
    product: serializeProduct(product),
  });
});

/** PUT /api/admin/products/[id] */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);
  const existing = await getProductById(id);
  const input = await readJson(req, productUpdateSchema);

  if (input.sku && input.sku !== existing.sku) {
    const dup = await prisma.product.findFirst({ where: { sku: input.sku, id: { not: id } } });
    if (dup) throw conflict("SKU 已存在");
  }
  if (input.slug && input.slug !== existing.slug) {
    const dup = await prisma.product.findFirst({ where: { slug: input.slug, id: { not: id } } });
    if (dup) throw conflict("slug 已存在");
  }

  const { sizeChart, specStock, ...rest } = input;
  // 一致性兜底：带规格库存时总库存强制 = min(各组之和)，杜绝整件数与规格数漂移
  const summedStock = specStock !== undefined ? aggregateTrackedStock(specStock) ?? undefined : undefined;
  // description 入库前净化
  const safeRest = rest.description !== undefined
    ? { ...rest, description: await sanitizeHtml(rest.description) }
    : rest;
  const product = await prisma.product.update({
    where: { id },
    data: {
      ...safeRest,
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn?.trim() || null } : {}),
      ...(summedStock !== undefined ? { stock: summedStock } : {}),
      ...(sizeChart !== undefined ? { sizeChart: sizeChart ?? Prisma.DbNull } : {}),
      ...(specStock !== undefined ? { specStock: specStock ?? Prisma.DbNull } : {}),
    },
    include: { category: true },
  });

  // 涉及库存/规格库存的更新：触发到货通知（服务内部按客户登记的规格逐条匹配，
  // 覆盖"某个规格单独回货而总量未变"的场景）
  if (input.stock !== undefined || specStock !== undefined) {
    void notifyRestock(id);
  }

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_PRODUCT_UPDATE",
    entity: "Product",
    entityId: id,
    req,
  });
  return json({ product: serializeProduct(product) });
});

/** DELETE /api/admin/products/[id] — 物理删除（从列表彻底移除）
 *  订单历史安全：OrderItem 存有 name/image/sku/price 快照且 productId onDelete=SetNull，
 *  删除后历史订单仍完整展示；CartItem/Review 为 Cascade 一并清理；NotifyMe 引用会保留但失联。 */
export const DELETE = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);
  const existing = await getProductById(id);
  const name = existing.name;

  await prisma.product.delete({ where: { id } });

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_PRODUCT_DELETE",
    entity: "Product",
    entityId: id,
    meta: { name },
    req,
  });
  return json({ ok: true, name });
});
