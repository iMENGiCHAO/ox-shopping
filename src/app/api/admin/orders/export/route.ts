import { apiHandler, searchParam } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { dateString } from "@/lib/utils";
import { toCsv, normalizeRows } from "@/lib/csv";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import type { OrderStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

/** GET /api/admin/orders/export — 订单 CSV 导出(上限 5000 条) */
export const GET = apiHandler(async (req) => {
  const actor = await requireStaff();
  const sp = new URL(req.url).searchParams;
  const status = searchParam(sp, "status");
  const q = searchParam(sp, "q");
  const from = searchParam(sp, "from");
  const to = searchParam(sp, "to");

  const where: Prisma.OrderWhereInput = {};
  if (status && (ORDER_STATUSES as string[]).includes(status)) {
    where.status = status as OrderStatus;
  }
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { addressSnapshot: { path: ["recipientName"], string_contains: q } },
    ];
  }
  if (from || to) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (
      (fromDate && Number.isNaN(fromDate.getTime())) ||
      (toDate && Number.isNaN(toDate.getTime()))
    ) {
      throw badRequest("日期格式不正确");
    }
    const createdAt: Prisma.DateTimeFilter = {};
    if (fromDate) createdAt.gte = fromDate;
    if (toDate) createdAt.lte = toDate;
    where.createdAt = createdAt;
  }

  const orders = await prisma.order.findMany({
    where,
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const rows = orders.map((o) => ({
    订单号: o.orderNumber,
    状态: ORDER_STATUS_LABELS[o.status],
    用户邮箱: o.user?.email ?? "",
    收货人: (o.addressSnapshot as { recipientName?: string } | null)?.recipientName ?? "",
    货币: o.currency,
    金额: Number(o.total),
    运费: Number(o.shippingFee),
    支付方式: o.paymentProvider ?? "",
    下单时间: o.createdAt.toISOString(),
    支付时间: o.paidAt?.toISOString() ?? "",
  }));

  const csv = toCsv(normalizeRows(rows));
  // 权限审计补痕：全量订单导出含收货人/邮箱 PII，SUPPORT 可拉取——外带必须留痕
  await audit({
    userId: actor.id,
    action: "ADMIN_ORDER_EXPORT",
    entity: "Order",
    entityId: "batch",
    meta: { rows: rows.length, status: status ?? null, q: q ?? null, from: from ?? null, to: to ?? null },
    req,
  });
  const filename = `orders-${dateString(new Date()).replace(/-/g, "")}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  });
});
