import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertOrderOwner, getOrderByNumber } from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** GET /api/orders/[orderNumber] — 订单详情 */
export const GET = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const orderNumber = routeParam(ctx.params.orderNumber);

  const order = await getOrderByNumber(orderNumber);
  assertOrderOwner(order, user.id);

  return json({ order: serializeOrder(order) });
});
