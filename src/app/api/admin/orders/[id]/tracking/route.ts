import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { serializeOrder } from "@/server/serializers";
import { prisma } from "@/lib/prisma";
import { shipOrderSchema } from "@/lib/validations/admin";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

const EDITABLE_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

/**
 * PUT /api/admin/orders/[id]/tracking — 填写/更新物流信息(物流公司 + 单号)。
 * 用于：已发货订单补充/更正物流单号；或直接为已支付订单录入物流信息(不改变订单状态)。
 */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, shipOrderSchema);

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw notFound("订单不存在");
  if (!(EDITABLE_STATUSES as readonly string[]).includes(order.status)) {
    throw badRequest(`当前订单状态「${order.status}」不可录入物流信息`);
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      trackingCompany: input.trackingCompany,
      trackingNumber: input.trackingNumber,
    },
    include: { items: true },
  });

  await audit({
    userId: actor.id,
    action: "ORDER_TRACKING_UPDATE",
    entity: "Order",
    entityId: id,
    meta: {
      orderNumber: order.orderNumber,
      trackingCompany: input.trackingCompany,
      trackingNumber: input.trackingNumber,
    },
    req,
  });

  // 营销审计修复：此前直接返回 Prisma 原始行 —— 游客单的 accessToken（查单凭据）
  // 会随响应发给运营/staff，等于把任意游客订单的访问令牌散出去。统一走序列化。
  return json({ order: serializeOrder(updated) });
});
