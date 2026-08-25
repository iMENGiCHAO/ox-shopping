import "server-only";
import type { Coupon, Order, OrderItem, Review } from "@prisma/client";

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

export function serializeOrder(order: Order & { items?: OrderItem[] }) {
  return {
    ...order,
    subtotal: num(order.subtotal),
    shippingFee: num(order.shippingFee),
    tax: num(order.tax),
    discount: num(order.discount),
    total: num(order.total),
    items: order.items?.map(serializeOrderItem),
  };
}

export function serializeProduct<
  T extends { price: unknown; compareAtPrice?: unknown | null; costPrice?: unknown | null },
>(product: T) {
  return {
    ...product,
    price: num(product.price),
    compareAtPrice: product.compareAtPrice == null ? null : num(product.compareAtPrice),
    costPrice: product.costPrice == null ? null : num(product.costPrice),
  };
}

export function serializeReview<T>(review: T): T {
  return review;
}

export function serializeRefund<T extends { amount: unknown }>(refund: T) {
  return { ...refund, amount: num(refund.amount) };
}

export interface CouponPublic {
  code: string;
  type: string;
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  endsAt: Date;
}

export function serializeCoupon(
  coupon: Pick<Coupon, "code" | "type" | "value" | "minSpend" | "maxDiscount" | "endsAt">,
): CouponPublic {
  return {
    code: coupon.code,
    type: coupon.type,
    value: num(coupon.value),
    minSpend: num(coupon.minSpend),
    maxDiscount: coupon.maxDiscount == null ? null : num(coupon.maxDiscount),
    endsAt: coupon.endsAt,
  };
}

export type { Review };
