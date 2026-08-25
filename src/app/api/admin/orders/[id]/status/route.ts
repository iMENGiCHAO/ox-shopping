import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { cancelOrder, getOrderById, updateOrderStatus } from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { orderStatusUpdateSchema } from "@/lib/validations/admin";
import { routeParam } from "@/app/api/_lib/params";
import type { Order, OrderItem } from "@prisma/client";

export const runtime = "nodejs";

/** PUT /api/admin/orders/[id]/status */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, orderStatusUpdateSchema);

  const order = await getOrderById(id);

  let updated: (Order & { items: OrderItem[] }) | Order;
  // 取消未支付订单需恢复库存
  if (input.status === "CANCELLED" && order.status === "PENDING_PAYMENT") {
    updated = await cancelOrder(order, actor.id);
  } else {
    updated = await updateOrderStatus(order, input.status, { id: actor.id, name: actor.name });
  }

  return json({ order: serializeOrder(updated) });
});
