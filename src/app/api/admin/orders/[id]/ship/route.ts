import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { getOrderById, updateOrderStatus } from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { shipOrderSchema } from "@/lib/validations/admin";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** POST /api/admin/orders/[id]/ship — 发货 */
export const POST = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, shipOrderSchema);

  const order = await getOrderById(id);
  const updated = await updateOrderStatus(
    order,
    "SHIPPED",
    { id: actor.id, name: actor.name },
    { trackingCompany: input.trackingCompany, trackingNumber: input.trackingNumber },
  );

  return json({ order: serializeOrder(updated, { includeInternal: true }) });
});
