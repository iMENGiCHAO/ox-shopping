import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { orderAdminNoteSchema } from "@/lib/validations/admin";
import { serializeOrder } from "@/server/serializers";

export const runtime = "nodejs";

/**
 * PUT /api/admin/orders/[id]/note — 保存运营内部备注（缺陷报告 P1-8）。
 *
 * 与 `note`（顾客下单时填的备注）分离：顾客原话必须原样保留在订单上，
 * 运营的内部说明（"已电话确认改址"/"客户要求延迟发货"）写 adminNote，
 * 只出现在管理端，不随任何邮件发给顾客。
 */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, orderAdminNoteSchema);

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw notFound("订单不存在");

  const next = input.adminNote.length > 0 ? input.adminNote : null;
  const updated = await prisma.order.update({
    where: { id },
    data: { adminNote: next },
    include: { items: true },
  });

  await audit({
    userId: actor.id,
    action: "ORDER_ADMIN_NOTE_UPDATE",
    entity: "Order",
    entityId: order.id,
    meta: { orderNumber: order.orderNumber, cleared: next === null },
    req,
  });

  return json({ order: serializeOrder(updated, { includeInternal: true }) });
});
