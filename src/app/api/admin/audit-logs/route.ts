import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** GET /api/admin/audit-logs */
export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const action = searchParam(sp, "action");
  const q = searchParam(sp, "q");
  const userId = searchParam(sp, "userId");
  const from = searchParam(sp, "from");
  const to = searchParam(sp, "to");
  const { page, pageSize, skip, take } = parsePagination(sp);

  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = action;
  if (q) {
    where.OR = [
      { ip: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
    ];
  }
  if (userId) where.userId = userId;
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
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return jsonPaginated(rows, {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});
