import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { cancelOrder, getOrderById, updateOrderStatus } from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { orderStatusUpdateSchema } from "@/lib/validations/admin";
import { routeParam } from "@/app/api/_lib/params";
import { ApiError } from "@/lib/errors";
import type { Order, OrderItem } from "@prisma/client";

export const runtime = "nodejs";

/**
 * PUT /api/admin/orders/[id]/status
 *
 * 注意：管理员不能直接将订单标记为"已送达"(DELIVERED)。
 * 已送达状态只能由购物者在前端点击"确认收货"来触发。
 * 这符合商业逻辑：确认收货是购物者的权利，不是管理员的操作。
 */
export const PUT = apiHandler(async (req, ctx) => {
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, orderStatusUpdateSchema);
  /* 权限分级（P1-1）：REFUNDED 会真实出账（走网关退款），必须 ADMIN。
     此前一律 requireStaff —— SUPPORT 角色也能对单笔订单全额退款，与批量接口
     （batch-status 对 REFUNDED 用 requireAdmin）口径不一致，属漏改。 */
  const actor =
    input.status === "REFUNDED" ? await requireAdmin() : await requireStaff();

  const order = await getOrderById(id);

  // 管理员不能直接标记为已送达，只能由购物者确认收货
  if (input.status === "DELIVERED" && order.status === "SHIPPED") {
    throw new ApiError(400, "BAD_REQUEST", "已送达状态需由购物者在前端确认收货，管理员不可直接操作");
  }

  let updated: (Order & { items: OrderItem[] }) | Order;
  // 取消未支付订单需恢复库存
  if (input.status === "CANCELLED" && order.status === "PENDING_PAYMENT") {
    updated = await cancelOrder(order, actor.id);
  } else {
    updated = await updateOrderStatus(order, input.status, { id: actor.id, name: actor.name });
  }

  return json({ order: serializeOrder(updated, { includeInternal: true }) });
});
