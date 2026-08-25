import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertOrderOwner, cancelOrder, getOrderByNumber } from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/cancel — 用户取消订单 */
export const POST = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const orderNumber = routeParam(ctx.params.orderNumber);

  const order = await getOrderByNumber(orderNumber);
  assertOrderOwner(order, user.id);

  const updated = await cancelOrder(order, user.id);
  return json({ order: serializeOrder(updated) });
});
