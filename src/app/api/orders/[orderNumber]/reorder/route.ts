import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertOrderOwner, getOrderByNumber } from "@/server/services/order.service";
import { routeParam } from "@/app/api/_lib/params";
import { prisma } from "@/lib/prisma";
import {
  addToCart,
  loadActiveVariants,
  specAvailableQuantity,
  type SpecSelection,
} from "@/server/services/cart.service";
import { MAX_CART_ITEM_QUANTITY } from "@/lib/constants";

/**
 * POST /api/orders/[orderNumber]/reorder
 *
 * 再次购买 — 把历史订单的所有**有货**商品加入购物车
 * - 业务铁律：先判库存，没库存绝不入库；有库存才能加入购物车
 *   （跳过原因用英文源串，本地化交给前端词典，英文站不漏中文）
 * - 库存判断含规格级：选中规格的 specStock 明细为 0 即视为售罄，
 *   不拿商品总库存兜底（总库存是所有颜色/尺码之和，会放行售罄规格）
 * - 数量 = 历史 quantity，cap 在该规格可售库存 / MAX_CART_ITEM_QUANTITY
 * - 返回加入结果，跳过的商品原因（reason key 走 i18n，值仅枚举）
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
    select: { id: true, name: true, stock: true, status: true, isPresale: true, specStock: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  // 组合粒度（2026-09-30 商用审计 P1-2）：变体商品的库存真相在组合 ——
  // specStock 已被管理端 PUT 置 null，不传 variants 会回落商品总库存，
  // 「组合剩 2、总量 50」的行不被压量，addToCart 按组合校验才拒 → 整行被跳过
  const variantsByProduct = await loadActiveVariants(productIds);

  const added: { productId: string; name: string; quantity: number }[] = [];
  const skipped: { productId: string; name: string; reason: string }[] = [];

  /** 订单行的规格选择（与 addToCart 的 SpecSelection 同构） */
  const parseAttributes = (raw: unknown): SpecSelection[] => {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((a) =>
      a &&
      typeof a === "object" &&
      typeof (a as { name?: unknown }).name === "string" &&
      typeof (a as { value?: unknown }).value === "string"
        ? [{ name: (a as { name: string }).name, value: (a as { value: string }).value }]
        : [],
    );
  };

  for (const it of items) {
    if (!it.productId) continue;
    const product = productMap.get(it.productId);
    if (!product) {
      skipped.push({ productId: it.productId, name: it.productName, reason: "Unavailable" });
      continue;
    }
    if (product.status === "ARCHIVED" || product.status === "DRAFT") {
      skipped.push({ productId: it.productId, name: product.name, reason: "Unavailable" });
      continue;
    }
    // ── 先判库存（组合粒度）：售罄 → 跳过，绝不进购物车 ──
    const attrs = parseAttributes(it.attributes);
    const available = specAvailableQuantity(product, attrs, variantsByProduct.get(it.productId) ?? null);
    let qty = it.quantity;
    if (!product.isPresale && qty > available) {
      qty = Math.max(0, available);
    }
    if (qty <= 0) {
      skipped.push({ productId: it.productId, name: product.name, reason: "Out of stock" });
      continue;
    }
    qty = Math.min(qty, MAX_CART_ITEM_QUANTITY);
    try {
      await addToCart(user.id, it.productId, qty, attrs);
      added.push({ productId: it.productId, name: product.name, quantity: qty });
    } catch (err) {
      skipped.push({
        productId: it.productId,
        name: product.name,
        // addToCart 抛的是英文源串（error-i18n 负责本地化），原样带给前端展示
        reason: err instanceof Error ? err.message : "Failed to add",
      });
    }
  }

  return json({ added, skipped, addedCount: added.length, skippedCount: skipped.length });
});
