import { apiHandler, json } from "@/lib/api";
import { requireOrderAccess } from "@/server/services/order-access";
import { serializeOrder } from "@/server/serializers";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** GET /api/orders/[orderNumber] — 订单详情（登录单本人 / 游客单凭查询令牌） */
export const GET = apiHandler(async (req, ctx) => {
  const orderNumber = routeParam(ctx.params.orderNumber);
  const { order } = await requireOrderAccess(req, orderNumber);
  return json({ order: serializeOrder(order) });
});
