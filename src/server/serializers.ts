import "server-only";
import type { Order, OrderItem } from "@prisma/client";

/**
 * API 序列化辅助：把 Prisma Decimal 字段转换为 number，
 * 避免 JSON 序列化时 Decimal 变成字符串。Date 保持原样(JSON 自动 ISO 序列化)。
 */

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

export function serializeOrderItem(item: OrderItem) {
  return { ...item, price: num(item.price), subtotal: num(item.subtotal) };
}

/**
 * 订单序列化。
 *
 * ⚠️ 安全：**必须剥掉 `accessToken`**。它是游客订单的免登录查询凭据，
 * 一旦随列表响应（用户订单列表、后台订单列表、导出等）流出，
 * 拿到列表的任何一方都能直接打开他人订单详情。
 * 需要该令牌的唯一场景是「刚下单成功」那一次响应，由 /api/orders 显式单独返回。
 *
 * ⚠️ 同样默认剥掉 `adminNote`（运营内部备注）：本函数同时服务**顾客侧**接口
 * （下单/取消/查单/确认收货），内部备注若随响应流出，等于把「已标记该客户为疑似
 * 恶意退货」这类内部判断直接告诉顾客。仅管理端显式 `includeInternal: true` 时回填。
 */
export function serializeOrder(
  order: Order & { items?: OrderItem[] },
  opts?: { includeInternal?: boolean },
) {
  const { accessToken: _accessToken, adminNote: _adminNote, ...safe } = order;
  return {
    ...safe,
    ...(opts?.includeInternal ? { adminNote: order.adminNote ?? null } : {}),
    subtotal: num(order.subtotal),
    shippingFee: num(order.shippingFee),
    tax: num(order.tax),
    discount: num(order.discount),
    total: num(order.total),
    // 货到付款参考金额（仅 COD 订单有值；非 COD 为 null）
    codFee: order.codFee == null ? null : num(order.codFee),
    items: order.items?.map(serializeOrderItem),
  };
}

export function serializeProduct<
  T extends {
    price: unknown;
    compareAtPrice?: unknown | null;
    costPrice?: unknown | null;
    variants?: { price?: unknown | null }[] | null;
  },
>(product: T) {
  return {
    ...product,
    // 变体覆盖价是 Decimal → 前端要 number（JSON 序列化会变字符串，表单校验会误判）
    variants: (product.variants ?? []).map((v) => ({
      ...v,
      price: v.price == null ? null : num(v.price),
    })),
    price: num(product.price),
    compareAtPrice: product.compareAtPrice == null ? null : num(product.compareAtPrice),
    costPrice: product.costPrice == null ? null : num(product.costPrice),
  };
}

export function serializeRefund<T extends { amount: unknown }>(refund: T) {
  return { ...refund, amount: num(refund.amount) };
}

/**
 * 折扣码序列化：Decimal → number，并可附上核销笔数（后台列表展示用）。
 * 放在公共序列化模块而非路由文件里——Next 会校验 route.ts 的导出类型，
 * 路由文件只允许导出 HTTP handler 与路由段配置。
 */
export function serializeCoupon(c: {
  value: unknown;
  minSpend: unknown;
  maxDiscount: unknown | null;
  _count?: { redemptions: number };
}) {
  return {
    ...c,
    value: num(c.value),
    minSpend: num(c.minSpend),
    maxDiscount: c.maxDiscount == null ? null : num(c.maxDiscount),
    redemptionCount: c._count?.redemptions,
  };
}
