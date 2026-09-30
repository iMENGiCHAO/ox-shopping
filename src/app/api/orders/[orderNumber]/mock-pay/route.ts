import { apiHandler, json } from "@/lib/api";
import { badRequest, forbidden, rateLimited } from "@/lib/errors";
import { requireOrderAccess } from "@/server/services/order-access";
import { markOrderPaid } from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { mockPaymentAllowedInProd } from "@/lib/env";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/mock-pay — 模拟支付 */
export const POST = apiHandler(async (req, ctx) => {
  const orderNumber = routeParam(ctx.params.orderNumber);
  const { order } = await requireOrderAccess(req, orderNumber);

  // 模拟支付=免费下单：生产环境未显式允许时一律拒绝（防绕过前台置灰直接调 API）。
  // 口径与 createPaymentUrl 的渠道分发一致（P2-7 商用审计）：按**订单的支付渠道**
  // （order.paymentProvider === "mock"）判定，而不是全局 effectivePaymentMode ——
  // 此前「PAYMENT_MODE=stripe + 后台启用 mock 渠道 + ALLOW_MOCK_PAYMENT_IN_PROD=true」
  // 的组合会让 createPaymentUrl 放行、这里恒 403：顾客进模拟支付页却无法支付，
  // 订单卡 PENDING_PAYMENT 30 分钟后自动取消（支付死循环）。
  if (order.paymentProvider !== "mock" || !mockPaymentAllowedInProd) {
    throw forbidden("Mock payment is not enabled");
  }

  // COD（货到付款）现金交易：全链路不存在「线上支付」这一步。
  // 必须显式拒绝，不能落到下面的 `alreadyPaid: true` 分支 —— 那会让调用方以为
  // 钱已收到，而事实是 paidAt=null、「送达时才向配送员收现金」（商业交付缺陷 A2 的延伸：
  // 集成测试实测该接口对 PROCESSING 的 COD 单返回 200 alreadyPaid）。
  if (order.isCashOnDelivery) {
    throw badRequest(
      "Cash-on-delivery orders are paid to the courier on delivery — online payment is not applicable",
    );
  }

  // 提前校验：已支付/已取消/已退款的订单直接返回明确结果（避免静默成功）
  if (
    order.status === "PAID" ||
    order.status === "PROCESSING" ||
    order.status === "SHIPPED" ||
    order.status === "DELIVERED"
  ) {
    return json({ order: serializeOrder(order), alreadyPaid: true });
  }
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    throw badRequest(`Order in status "${order.status}" cannot be paid`);
  }

  const rl = await rateLimit({ key: `mock-pay:${orderNumber}`, ...RATE_LIMITS.mockPay });
  if (!rl.ok) throw rateLimited();

  const updated = await markOrderPaid(orderNumber, `mock_${orderNumber}`);
  return json({
    order: serializeOrder(updated),
    alreadyPaid: updated.status !== "PENDING_PAYMENT",
  });
});
