import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { serializeRefund } from "@/server/serializers";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
import type { RefundStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const REFUND_STATUSES: RefundStatus[] = [
  "REQUESTED",
  "APPROVED",
  "PENDING",
  "FAILED",
  "REJECTED",
  "REFUNDED",
];

/** GET /api/admin/refunds */
export const GET = apiHandler(async (req) => {
  await requireStaff();
  const sp = new URL(req.url).searchParams;
  const status = searchParam(sp, "status");
  const { page, pageSize, skip, take } = parsePagination(sp);

  const where: Prisma.RefundWhereInput = {};
  if (status && (REFUND_STATUSES as string[]).includes(status)) {
    where.status = status as RefundStatus;
  }

  const [rows, total] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: {
        order: { include: { items: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.refund.count({ where }),
  ]);

  return jsonPaginated(rows.map(serializeRefund), {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});
