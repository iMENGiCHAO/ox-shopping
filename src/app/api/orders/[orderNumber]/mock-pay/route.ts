import { apiHandler, json } from "@/lib/api";
import { forbidden, rateLimited } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { assertOrderOwner, getOrderByNumber, markOrderPaid } from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { rateLimit } from "@/lib/rate-limit";
import { effectivePaymentMode } from "@/lib/env";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/mock-pay — 模拟支付 */
export const POST = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const orderNumber = routeParam(ctx.params.orderNumber);

  const order = await getOrderByNumber(orderNumber);
  assertOrderOwner(order, user.id);

  if (effectivePaymentMode !== "mock") throw forbidden("模拟支付未启用");

  const rl = await rateLimit({ key: `mock-pay:${orderNumber}`, limit: 10, windowSeconds: 60 });
  if (!rl.ok) throw rateLimited();

  const updated = await markOrderPaid(orderNumber, `mock_${orderNumber}`);
  return json({ order: serializeOrder(updated) });
});
