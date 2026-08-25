import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { serializeOrder } from "@/server/serializers";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
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

/** GET /api/admin/orders */
export const GET = apiHandler(async (req) => {
  await requireStaff();
  const sp = new URL(req.url).searchParams;
  const status = searchParam(sp, "status");
  const q = searchParam(sp, "q");
  const from = searchParam(sp, "from");
  const to = searchParam(sp, "to");
  const { page, pageSize, skip, take } = parsePagination(sp);

  const where: Prisma.OrderWhereInput = {};
  if (status && (ORDER_STATUSES as string[]).includes(status)) {
    where.status = status as OrderStatus;
  }
  if (searchParam(sp, "presale") === "true") {
    where.items = { some: { product: { isPresale: true } } };
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

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ]);

  return jsonPaginated(rows.map(serializeOrder), {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});
