import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertOrderOwner, getOrderByNumber } from "@/server/services/order.service";
import { routeParam } from "@/app/api/_lib/params";
import { prisma } from "@/lib/prisma";
import { addToCart } from "@/server/services/cart.service";
import { MAX_CART_ITEM_QUANTITY } from "@/lib/constants";

/**
 * POST /api/orders/[orderNumber]/reorder
 *
 * 再次购买 — 把历史订单的所有有货商品加入购物车
 * - 跳过已下架 / 已删除 / 缺货商品
 * - 数量 = 历史 quantity，但 cap 在 stock / MAX_CART_ITEM_QUANTITY
 * - 返回加入结果，跳过的商品原因
 */
export const POST = apiHandler(async (_req, ctx) => {
  const user = await requireUser();
  const orderNumber = routeParam(ctx.params.orderNumber);

  const order = await getOrderByNumber(orderNumber);
  assertOrderOwner(order, user.id);

  const items = await prisma.orderItem.findMany({
    where: { orderId: order.id },
  });

  const productIds = items
    .map((it) => it.productId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, stock: true, status: true, isPresale: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const added: { productId: string; name: string; quantity: number }[] = [];
  const skipped: { productId: string; name: string; reason: string }[] = [];

  for (const it of items) {
    if (!it.productId) continue;
    const product = productMap.get(it.productId);
    if (!product) {
      skipped.push({ productId: it.productId, name: it.productName, reason: "已下架" });
      continue;
    }
    if (product.status === "ARCHIVED" || product.status === "DRAFT") {
      skipped.push({ productId: it.productId, name: product.name, reason: "已下架" });
      continue;
    }
    let qty = it.quantity;
    if (!product.isPresale && qty > product.stock) {
      qty = product.stock;
    }
    if (qty <= 0) {
      skipped.push({ productId: it.productId, name: product.name, reason: "已售罄" });
      continue;
    }
    qty = Math.min(qty, MAX_CART_ITEM_QUANTITY);
    try {
      // addToCart 接受 SpecSelection[]，从 JSON 字段做类型守卫
      const attrs = Array.isArray(it.attributes) ? (it.attributes as unknown) : [];
      const safeAttrs: { name: string; value: string }[] = Array.isArray(attrs)
        ? (attrs as unknown[]).flatMap((a) => {
            if (
              a &&
              typeof a === "object" &&
              typeof (a as { name?: unknown }).name === "string" &&
              typeof (a as { value?: unknown }).value === "string"
            ) {
              return [{ name: (a as { name: string }).name, value: (a as { value: string }).value }];
            }
            return [];
          })
        : [];
      await addToCart(user.id, it.productId, qty, safeAttrs);
      added.push({ productId: it.productId, name: product.name, quantity: qty });
    } catch (err) {
      skipped.push({
        productId: it.productId,
        name: product.name,
        reason: err instanceof Error ? err.message : "加购失败",
      });
    }
  }

  return json({ added, skipped, addedCount: added.length, skippedCount: skipped.length });
});
