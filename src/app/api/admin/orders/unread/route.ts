import { apiHandler, json } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/admin/orders/unread-count
 * 返回未读订单数（用于 admin 顶栏 bell 角标）
 */
export const GET = apiHandler(async () => {
  await requireStaff();
  const count = await prisma.order.count({
    where: { isUnread: true, status: { in: ["PENDING_PAYMENT", "PAID", "PROCESSING"] } },
  });
  const refundCount = await prisma.refund.count({ where: { status: "REQUESTED" } });
  return json({ unreadOrders: count, pendingRefunds: refundCount });
});
