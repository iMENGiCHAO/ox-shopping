import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/session";
import { serializeProduct } from "@/server/serializers";
import { notifyRestock } from "@/server/services/notify-me.service";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { stockUpdateSchema } from "@/lib/validations/product";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** PATCH /api/admin/products/[id]/stock */
export const PATCH = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, stockUpdateSchema);

  // 业务连贯性守卫（大爷 2026-09-28）：有规格的商品，总库存必须是「各子规格之和」，
  // 绝不能在这里直接改写 —— 否则商品级数字与组合明细脱节（大爷：「以后库存就出乱子」）。
  const target = await prisma.product.findUnique({
    where: { id },
    select: { stock: true, attributes: true, specStock: true, isPresale: true },
  });
  const attrs = Array.isArray(target?.attributes)
    ? (target.attributes as { values?: unknown; selectable?: unknown }[])
    : [];
  const hasSpecs =
    attrs.some((a) => Array.isArray(a.values) && (a.values as unknown[]).length > 1) ||
    (target?.specStock != null && typeof target.specStock === "object");
  if (hasSpecs) {
    throw badRequest(
      "该商品有规格（颜色/尺码等）：总库存由各规格库存自动汇总，请在商品编辑页的「规格库存」里逐规格录入，不要直接修改总库存。",
    );
  }

  const before = target;

  const product = await prisma.product.update({
    where: { id },
    data: { stock: input.stock },
    include: { category: true },
  });

  // 补货（0→有货）：触发到货通知（服务内部按客户登记的规格逐条匹配）
  if ((before?.stock ?? 0) <= 0 && input.stock > 0) {
    void notifyRestock(id);
  }

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_PRODUCT_STOCK",
    entity: "Product",
    entityId: id,
    meta: { stockBefore: before?.stock ?? null, stockAfter: input.stock },
    req,
  });
  return json({ product: serializeProduct(product) });
});
