import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, conflict } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { assertOrderOwner, getOrderByNumber } from "@/server/services/order.service";
import { serializeRefund } from "@/server/serializers";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { refundRequestSchema } from "@/lib/validations/cart-order";
import { REFUNDABLE_STATUSES } from "@/lib/order-status";
import { routeParam } from "@/app/api/_lib/params";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** POST /api/orders/[orderNumber]/refund — 申请退款 */
export const POST = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const input = await readJson(req, refundRequestSchema);
  const orderNumber = routeParam(ctx.params.orderNumber);

  const order = await getOrderByNumber(orderNumber);
  assertOrderOwner(order, user.id);

  if (!REFUNDABLE_STATUSES.includes(order.status)) {
    throw badRequest("当前订单状态不可申请退款");
  }
  if (input.amount > Number(order.total)) {
    throw badRequest("退款金额不能超过订单金额");
  }

  const existing = await prisma.refund.findFirst({
    where: { orderId: order.id, status: "REQUESTED" },
  });
  if (existing) throw conflict("已有待审核的退款申请");

  const refund = await prisma.refund.create({
    data: {
      orderId: order.id,
      userId: user.id,
      reason: input.reason,
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
    },
  });

  await audit({
    userId: user.id,
    action: "REFUND_REQUEST",
    entity: "Refund",
    entityId: refund.id,
    meta: { orderNumber, amount: input.amount },
    req,
  });
  return json({ refund: serializeRefund(refund) });
});
