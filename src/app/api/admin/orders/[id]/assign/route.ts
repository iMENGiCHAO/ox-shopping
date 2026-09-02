import { apiHandler, json } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/**
 * POST /api/admin/orders/[id]/assign — 当前 staff 认领此订单
 * （认领后 isUnread=false，别人看到 assign 显示）
 * DELETE — 取消认领
 */
export const POST = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return json({ error: "订单不存在" }, { status: 404 });
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      assigneeId: actor.id,
      assignedAt: new Date(),
      isUnread: false,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  await audit({
    userId: actor.id,
    action: "ADMIN_ORDER_ASSIGN",
    entity: "Order",
    entityId: id,
    meta: { assigneeId: actor.id, assigneeName: actor.name },
    req,
  });

  return json({ order: updated });
});

export const DELETE = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);

  const updated = await prisma.order.update({
    where: { id },
    data: {
      assigneeId: null,
      assignedAt: null,
    },
  });

  await audit({
    userId: actor.id,
    action: "ADMIN_ORDER_UNASSIGN",
    entity: "Order",
    entityId: id,
    req,
  });

  return json({ order: updated });
});
