import { apiHandler, searchParam } from "@/lib/api";
import { badRequest, rateLimited } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { dateString } from "@/lib/utils";
import { toCsv, normalizeRows } from "@/lib/csv";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
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
  // PII 限流（安全审计）：导出含收件人姓名/电话/邮箱，被盗/内部滥用的会话
  // 不应能无限循环拉取 —— 单管理员 4 次/10 分钟
  const rl = await rateLimit({
    key: `admin-export:${actor.id}`,
    ...RATE_LIMITS.adminExport,
  });
  if (!rl.ok) throw rateLimited("Export limit reached — please retry in a few minutes");
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

  const EXPORT_LIMIT = 5000;
  const orders = await prisma.order.findMany({
    where,
    // 商品明细（运营审计 4-1）：此前导出不含 items —— 这份 CSV 无法拣货/对账/退货核算
    include: { user: { select: { email: true } }, items: true },
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT + 1,
  });
  const truncated = orders.length > EXPORT_LIMIT;
  const page = orders.slice(0, EXPORT_LIMIT);

  // 一订单一行 → 一商品项一行（拣货/退货核算需要 SKU 粒度）；订单级金额只在首项行
  // 显示，避免多行重复求和把金额放大。无 items 的历史单保留一行订单信息。
  const rows: Record<string, unknown>[] = page.flatMap((o): Record<string, unknown>[] => {
    const head = {
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
    };
    if (o.items.length === 0) {
      return [{ ...head, 商品名称: "", SKU: "", 规格: "", 数量: "", 单价: "" }];
    }
    return o.items.map((it, idx) => ({
      ...(idx === 0 ? head : { ...head, 金额: "", 运费: "" }),
      商品名称: it.productName,
      SKU: it.sku,
      规格: (it.attributes as { name: string; value: string }[] | null)?.map((a) => `${a.name}:${a.value}`).join(" / ") ?? "",
      数量: it.quantity,
      单价: Number(it.price),
    }));
  });

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
  // 截断可见（运营审计 4-2）：此前 5000 行静默截断，财务据缺行 CSV 会得出错误
  // 结论（佣金导出已修同类问题）。文件名加 -partial 标记 + 响应头双提示。
  const filename = `orders-${dateString(new Date()).replace(/-/g, "")}${truncated ? "-partial" : ""}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
      "X-Export-Truncated": truncated ? "true" : "false",
      "X-Export-Rows": String(rows.length),
    },
  });
});
