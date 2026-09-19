import { apiHandler, json } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireOrderAccess, orderContact } from "@/server/services/order-access";
import { updateOrderStatus } from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/confirm-delivery — 确认收货（游客单凭令牌） */
export const POST = apiHandler(async (req, ctx) => {
  const orderNumber = routeParam(ctx.params.orderNumber);
  const { order, user } = await requireOrderAccess(req, orderNumber);

  if (order.status !== "SHIPPED") throw badRequest("This order cannot be confirmed in its current state");

  // actor 为 null 时表示「客户自助操作但无账号」，审计仍会记录动作
  const actor = user ? { id: user.id, name: user.name } : { id: order.id, name: orderContact(order).name };
  const updated = await updateOrderStatus(order, "DELIVERED", actor);
  return json({ order: serializeOrder(updated) });
});
