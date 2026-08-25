import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import {
  assertOrderOwner,
  createPaymentUrl,
  getOrderByNumber,
} from "@/server/services/order.service";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/pay — 生成支付链接 */
export const POST = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const orderNumber = routeParam(ctx.params.orderNumber);

  const order = await getOrderByNumber(orderNumber);
  assertOrderOwner(order, user.id);

  const paymentUrl = await createPaymentUrl(order, user.email);
  return json({ paymentUrl });
});
