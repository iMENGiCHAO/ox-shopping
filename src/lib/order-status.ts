import type { OrderStatus } from "@prisma/client";
import {
  ORDER_STATUS_LABELS as ADMIN_ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS as ADMIN_ORDER_STATUS_COLORS,
  REFUND_STATUS_LABELS as ADMIN_REFUND_STATUS_LABELS,
} from "./admin-labels";

/**
 * 订单状态机：
 *   PENDING_PAYMENT → PAID → PROCESSING → SHIPPED → DELIVERED
 *   PENDING_PAYMENT → CANCELLED（仅未支付；库存回补；已支付订单的取消走 REFUNDED）
 *   PAID/PROCESSING/SHIPPED/DELIVERED → REFUNDED（取消 + 退款 + 库存回补）
 *
 * 说明：
 *   - PAID → CANCELLED 禁止：已支付应走 REFUNDED 走网关退款
 *   - PROCESSING/SHIPPED → CANCELLED 禁止：已进入履约环节，统一走 REFUNDED
 *
 * 文案/颜色统一从 admin-labels 复用（避免后台/前台文案漂移）
 */

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "SHIPPED", "REFUNDED"],
  PROCESSING: ["SHIPPED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

/** 允许申请退款的状态 */
export const REFUNDABLE_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

/** 可取消(用户主动)的状态 —— 仅未支付订单 */
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

/** 订单状态中文 label（统一从 admin-labels 复用） */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = ADMIN_ORDER_STATUS_LABELS;

/** 订单状态徽章颜色（统一从 admin-labels 复用） */
export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = ADMIN_ORDER_STATUS_COLORS;

/** 退款状态中文 label（统一从 admin-labels 复用） */
export const REFUND_STATUS_LABELS: Record<string, string> = ADMIN_REFUND_STATUS_LABELS;
