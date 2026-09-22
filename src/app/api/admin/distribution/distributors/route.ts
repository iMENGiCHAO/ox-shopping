import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { parsePagination } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { assertDistributionEnabled } from "@/server/services/distribution/http";

export const runtime = "nodejs";

/**
 * GET /api/admin/distribution/distributors — 分销商列表（is_distributor=1）
 *
 * 注意：分销商身份是**自动升级**产生的（首次成功推广即生效），
 * 所以这里没有"审核成为分销商"的入口 —— 与产品口径一致。
 */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip, take } = parsePagination(sp, { page: 1, pageSize: 10 });
  const q = searchParam(sp, "q");

  const where = {
    isDistributor: true,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { referralCode: q.toUpperCase() },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ firstPromoteAt: "desc" }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        name: true,
        email: true,
        referralCode: true,
        distLevel: true,
        firstPromoteAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  // 每个分销商的直接客户数 + 团队人数 + 账户余额（一次查询聚合，避免 N+1）
  const ids = users.map((u) => u.id);
  const [bindCounts, teamCounts, accounts] = await Promise.all([
    ids.length
      ? prisma.distributorCustomerBind.groupBy({
          by: ["distributorId"],
          where: { distributorId: { in: ids }, status: "ACTIVE" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.distributionRelation.groupBy({
          by: ["ancestorId"],
          where: { ancestorId: { in: ids }, depth: { gte: 1 } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.distributorAccount.findMany({ where: { userId: { in: ids } } })
      : Promise.resolve([]),
  ]);

  const bindMap = new Map(bindCounts.map((b) => [b.distributorId, b._count._all]));
  const teamMap = new Map(teamCounts.map((t) => [t.ancestorId, t._count._all]));
  const accountMap = new Map(accounts.map((a) => [a.userId, a]));

  return jsonPaginated(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      referralCode: u.referralCode,
      distLevel: u.distLevel,
      firstPromoteAt: u.firstPromoteAt?.toISOString() ?? null,
      customerCount: bindMap.get(u.id) ?? 0,
      teamCount: teamMap.get(u.id) ?? 0,
      balance: Number(accountMap.get(u.id)?.balance ?? 0),
      totalCommission: Number(accountMap.get(u.id)?.totalCommission ?? 0),
      tier: accountMap.get(u.id)?.tier ?? 0,
    })),
    { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  );
});
