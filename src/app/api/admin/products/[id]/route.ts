import { apiHandler, json, readJson } from "@/lib/api";
import { conflict } from "@/lib/errors";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { getProductById } from "@/server/services/product.service";
import { notifyRestock } from "@/server/services/notify-me.service";
import { aggregateTrackedStock } from "@/server/services/spec-stock";
import { variantSignature } from "@/server/services/variant-stock";
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
  const actor = await requireAdmin();
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

  // variants 不是 Product 的列（独立表），必须从展开对象里剔除后单独处理
  const { sizeChart, specStock, variants, ...rest } = input;
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
      // SKU 矩阵：全量替换（商品表单 / 大表内联编辑都提交完整组合集）。
      // 商品级库存一致性（大爷 2026-09-29 定稿）：
      //   - 有组合（variants.length > 0）→ stock 强制 = Σ 组合库存。
      //     父组与商品总库存都是只读派生值，任何入口都不许手写，
      //     杜绝「总库存 ≠ 组合之和」的库存乱账。
      //   - 传空数组 = 运营删光属性组（回归单规格）→ 回落顺序：
      //     显式 specStock 汇总 → 请求里的 stock → 原库存。
      //     此前固定回落 existing.stock，会把「删光规格 + 手填库存」的输入静默丢弃。
      ...(variants !== undefined
        ? {
            stock:
              variants.length > 0
                ? variants.reduce((sum, v) => sum + v.stock, 0)
                : (summedStock ?? input.stock ?? existing.stock),
            variants: {
              deleteMany: {},
              create: variants.map((v) => ({
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
    },
    // include variants：响应自描述（保存后的组合列表可直接核对，与大表列表同口径）
    include: { category: true, variants: { orderBy: { createdAt: "asc" } } },
  });

  // 涉及库存/规格库存的更新：触发到货通知（服务内部按客户登记的规格逐条匹配，
  // 覆盖"某个规格单独回货而总量未变"的场景）
  if (input.stock !== undefined || specStock !== undefined || variants !== undefined) {
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
 *  删除后历史订单仍完整展示；CartItem 为 Cascade 一并清理；NotifyMe 引用会保留但失联。 */
export const DELETE = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
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
