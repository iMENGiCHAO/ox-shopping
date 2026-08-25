import { apiHandler, json } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import {
  assertOrderOwner,
  getOrderByNumber,
  updateOrderStatus,
} from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/confirm-delivery — 确认收货 */
export const POST = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const orderNumber = routeParam(ctx.params.orderNumber);

  const order = await getOrderByNumber(orderNumber);
  assertOrderOwner(order, user.id);

  if (order.status !== "SHIPPED") throw badRequest("当前状态不可确认收货");

  const updated = await updateOrderStatus(order, "DELIVERED", { id: user.id, name: user.name });
  return json({ order: serializeOrder(updated) });
});
