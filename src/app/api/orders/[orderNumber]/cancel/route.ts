import { apiHandler, json } from "@/lib/api";
import { requireOrderAccess } from "@/server/services/order-access";
import { cancelOrder } from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/cancel — 取消订单（登录单本人 / 游客单凭令牌） */
export const POST = apiHandler(async (req, ctx) => {
  const orderNumber = routeParam(ctx.params.orderNumber);
  const { order, user } = await requireOrderAccess(req, orderNumber);

  // 游客单没有账号，审计的操作人退到 null（审计日志本身仍会记录动作与订单号）
  const updated = await cancelOrder(order, user?.id ?? null);
  return json({ order: serializeOrder(updated) });
});
