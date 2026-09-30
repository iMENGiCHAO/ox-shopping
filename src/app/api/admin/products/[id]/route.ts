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

  // SKU 矩阵（组合粒度）：乐观锁 + diff 落库（2026-09-30 商用审计 P1-1，全项目离 P0 最近的洞）。
  //   此前 deleteMany 全量替换 + 按「表单加载时」的快照重建 —— 管理员打开表单后顾客
  //   下单扣减，保存时（哪怕只改标题）快照把已卖库存复活 → 超卖；多管理员并发编辑
  //   后保存者整体覆盖前者（无任何防护）。
  //   现在：
  //   - 事务内先对 products 行 FOR UPDATE：与下单扣减（order.service 同款）/其他编辑串行化；
  //   - expectedStock（表单/大表加载时的每组合快照）在锁内与库内现值比对，
  //     不一致 → 409 拒绝保存（「库存已被其他操作变更，请刷新后重试」），
  //     从根上杜绝「快照复活已卖库存」；未带 expectedStock 的旧客户端保持兼容（直接覆盖）；
  //   - diff 落库：传入组合按 signature upsert，矩阵外的旧组合（被删的组）定点删除，
  //     不再 deleteMany 全表 —— 未删的行不动，锁窗口内其它写入不被误清。
  const product = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
    const fresh = await tx.product.findUnique({
      where: { id },
      include: { variants: true },
    });
    if (!fresh) throw conflict("商品不存在或已被删除");

    let variantsTotal = 0;
    let variantsData: Prisma.ProductUpdateInput["variants"] | undefined;
    if (variants !== undefined) {
      // 乐观锁：快照比对（锁内，与下单扣减串行）
      if (variants.length > 0) {
        const curBySig = new Map(fresh.variants.map((v) => [v.signature, v]));
        for (const v of variants) {
          const cur = curBySig.get(variantSignature(v.attributes));
          if (cur && v.expectedStock != null && cur.stock !== v.expectedStock) {
            throw conflict("Stock has been changed by another operation — refresh and retry");
          }
        }
      }
      variantsTotal = variants.reduce((sum, v) => sum + v.stock, 0);
      const incomingSigs = variants.map((v) => variantSignature(v.attributes));
      variantsData = {
        // 只删矩阵外的旧组合（被删的组）；传空数组 = 删光（运营删光属性组）
        deleteMany: { signature: { notIn: incomingSigs } },
        upsert: variants.map((v) => {
          const sig = variantSignature(v.attributes);
          const row = {
            attributes: v.attributes as unknown as Prisma.InputJsonValue,
            stock: v.stock,
            price: v.price != null ? new Prisma.Decimal(v.price.toFixed(2)) : null,
            sku: v.sku?.trim() || null,
            image: v.image?.trim() || null,
            isActive: v.isActive,
          };
          return {
            where: { productId_signature: { productId: id, signature: sig } },
            update: row,
            create: { productId: id, signature: sig, ...row },
          };
        }),
      };
    }

    return tx.product.update({
      where: { id },
      data: {
        ...safeRest,
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn?.trim() || null } : {}),
        ...(summedStock !== undefined ? { stock: summedStock } : {}),
        ...(sizeChart !== undefined ? { sizeChart: sizeChart ?? Prisma.DbNull } : {}),
        ...(specStock !== undefined ? { specStock: specStock ?? Prisma.DbNull } : {}),
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
                  ? variantsTotal
                  : (summedStock ?? input.stock ?? fresh.stock),
              variants: variantsData,
            }
          : {}),
      },
      // include variants：响应自描述（保存后的组合列表可直接核对，与大表列表同口径）
      include: { category: true, variants: { orderBy: { createdAt: "asc" } } },
    });
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
