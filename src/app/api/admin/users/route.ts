import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
import type { UserStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const USER_STATUSES: UserStatus[] = ["ACTIVE", "DISABLED"];

/** GET /api/admin/users */
export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const q = searchParam(sp, "q");
  const status = searchParam(sp, "status");
  const { page, pageSize, skip, take } = parsePagination(sp);

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  if (status && (USER_STATUSES as string[]).includes(status)) {
    where.status = status as UserStatus;
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { orders: true, reviews: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  return jsonPaginated(rows, {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});
