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

  // 业务连贯性守卫（大爷 2026-09-29 定稿）：有子组规格的商品，总库存必须是
  // 「各子组组合之和」，绝不能在这里直接改写 —— 否则商品级数字与组合明细脱节
  // （大爷：「以后库存就出乱子」）。覆盖两种规格形态：
  //   1) 变体组合（ProductVariant 非空，父组×子组组合粒度）—— 此前漏判：
  //      单值属性组的变体商品（如一个组只有 1 个值）会被误放行；
  //   2) 可选属性组（多值组默认可选，与表单/店面同口径）。
  // 注意：孤立的 specStock（组名不在属性里）或单值以下属性的维度池残留
  // **不拦** —— 它们没有可选规格可管理（前台从不渲染选择器），直改无脱节风险。
  const [target, variantCount] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      select: { stock: true, attributes: true, specStock: true, isPresale: true },
    }),
    prisma.productVariant.count({ where: { productId: id } }),
  ]);
  const attrs = Array.isArray(target?.attributes)
    ? (target.attributes as { values?: unknown; selectable?: unknown }[])
    : [];
  const hasSpecPool =
    attrs.some(
      (a) =>
        a.selectable !== false &&
        Array.isArray(a.values) &&
        (a.values as unknown[]).length > 1,
    ) || variantCount > 0;
  if (hasSpecPool) {
    throw badRequest(
      "该商品有规格（父组/子组）：总库存 = 各子组规格库存之和，自动汇总、不可手写。请点击库存列的铅笔逐个规格录入。",
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
