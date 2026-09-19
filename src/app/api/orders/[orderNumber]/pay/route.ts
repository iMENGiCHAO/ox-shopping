import { apiHandler, json } from "@/lib/api";
import { requireOrderAccess, orderContact } from "@/server/services/order-access";
import { createPaymentUrl } from "@/server/services/order.service";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/pay — 生成支付链接（游客单凭令牌可重新发起支付） */
export const POST = apiHandler(async (req, ctx) => {
  const orderNumber = routeParam(ctx.params.orderNumber);
  const { order, user } = await requireOrderAccess(req, orderNumber);

  // 收银台收件人：登录单用账号邮箱，游客单用订单联系邮箱（否则网关侧收件人为空）
  const paymentUrl = await createPaymentUrl(order, user?.email ?? orderContact(order).email);
  return json({ paymentUrl });
});
