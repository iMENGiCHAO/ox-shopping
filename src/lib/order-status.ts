import type { OrderStatus } from "@prisma/client";

/**
 * 订单状态机：
 * PENDING_PAYMENT → PAID → PROCESSING → SHIPPED → DELIVERED
 * PENDING_PAYMENT → CANCELLED
 * PAID/PROCESSING/SHIPPED/DELIVERED → REFUNDED(退款完成)
 */

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "SHIPPED", "REFUNDED"],
  PROCESSING: ["SHIPPED", "CANCELLED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

/** 允许申请退款的状态 */
export const REFUNDABLE_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

/** 可取消(用户主动)的状态 */
export const CANCELLABLE_STATUSES: OrderStatus[] = ["PENDING_PAYMENT"];

/** 可确认收货的状态 */
export const CONFIRMABLE_STATUSES: OrderStatus[] = ["SHIPPED"];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_FLOW[from]?.includes(to) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`非法状态流转：${from} → ${to}`);
  }
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Payment pending",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "warning",
  PAID: "info",
  PROCESSING: "info",
  SHIPPED: "primary",
  DELIVERED: "success",
  CANCELLED: "muted",
  REFUNDED: "destructive",
} as const;

export const REFUND_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REFUNDED: "Refunded",
};
