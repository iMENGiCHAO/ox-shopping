import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/errors";
import { orderAddressUpdateSchema } from "@/lib/validations/admin";
import { serializeOrder } from "@/server/serializers";

export const runtime = "nodejs";

/**
 * 不可改址的状态：订单已终结（取消/已退款）。
 * 已发货的订单允许改址（承运商中途改址是真实运营场景：顾客打电话要求改送到公司），
 * 但发货后的改址必须留痕 —— 审计日志记录了改动前后的完整快照。
 */
const LOCKED_STATUSES = ["CANCELLED", "REFUNDED"] as const;

/**
 * PUT /api/admin/orders/[id]/address — 修改订单收货地址（缺陷报告 P1-8）。
 *
 * 背景：此前地址只读。顾客下单后发现门牌号写错/要改寄公司，客服只能
 * 「取消重下」——已支付订单重下要重新走支付与退款，还可能丢优惠券与库存占用。
 * 现在允许运营直接改 addressSnapshot（订单快照，不影响用户地址簿）。
 */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, orderAddressUpdateSchema);

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw notFound("订单不存在");
  if ((LOCKED_STATUSES as readonly string[]).includes(order.status)) {
    throw badRequest(`订单已「${order.status === "CANCELLED" ? "取消" : "退款"}」，不可修改收货地址`);
  }

  // 与原下单同形：addressSnapshot 的消费方（订单页/发票/发货单）按这些键读取
  const nextSnapshot = {
    recipientName: input.recipientName,
    phone: input.phone ?? null,
    country: input.country ?? null,
    province: input.province ?? null,
    city: input.city ?? null,
    district: input.district ?? null,
    postalCode: input.postalCode ?? null,
    detail: input.detail,
  };

  const updated = await prisma.order.update({
    where: { id },
    data: { addressSnapshot: nextSnapshot },
    include: { items: true },
  });

  await audit({
    userId: actor.id,
    action: "ORDER_ADDRESS_UPDATE",
    entity: "Order",
    entityId: order.id,
    // 前后快照都留痕：改址争议（"到底谁写错了地址"）时可回溯
    meta: { orderNumber: order.orderNumber, before: order.addressSnapshot, after: nextSnapshot },
    req,
  });

  return json({ order: serializeOrder(updated, { includeInternal: true }) });
});
