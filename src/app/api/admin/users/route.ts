import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
import { getRateSnapshot } from "@/components/shop/currency-server";
import type { UserStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const USER_STATUSES: UserStatus[] = ["ACTIVE", "DISABLED"];

/** GET /api/admin/users — 客户列表（含消费汇总：多币种按订单汇率快照折算 CNY） */
export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const q = searchParam(sp, "q");
  const status = searchParam(sp, "status");
  const unverified = sp.get("unverified") === "1";
  const deletion = sp.get("deletion") === "1";
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
  if (unverified) where.emailVerified = false;
  if (deletion) where.deletionRequestedAt = { not: null };

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
        deletionRequestedAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  // 本页客户的订单聚合：有效消费（paid 且非取消/退款）按各订单的汇率快照折算 CNY，
  // 与仪表盘「各币种销售汇总」完全同口径；金额不能直接 sum（跨币种混加没有意义）。
  // 性能审计下推：此前 findMany 无 take 拉本页用户**全部历史订单**回 Node 聚合
  // （鲸鱼用户把单页放大到数千行）—— 现一条 SQL groupBy 库内完成，口径逐分支对照
  // （游客单 userId 为 null 天然不在 IN 列表里，聚合只含本页注册用户）。
  const ids = rows.map((r) => r.id);
  const usdCnyRate = ids.length
    ? await getRateSnapshot().then((s) => s.rates["CNY"] ?? 7.2)
    : 7.2;

  const aggRows =
    ids.length > 0
      ? await prisma.$queryRaw<
          { userId: string; lastOrderAt: Date | null; paidCount: number; paidCny: string }[]
        >`
          SELECT
            o."userId" AS "userId",
            MAX(o."createdAt") AS "lastOrderAt",
            COUNT(*) FILTER (
              WHERE o."paidAt" IS NOT NULL
                AND o."status" NOT IN ('CANCELLED', 'REFUNDED')
            )::int AS "paidCount",
            COALESCE(SUM(
              CASE WHEN COALESCE(o."exchangeRate", 0) > 0
                    AND COALESCE(NULLIF(o."currency", ''), 'USD') <> 'USD'
                THEN o."total"::numeric / o."exchangeRate"::numeric
                ELSE o."total"::numeric END
              * CAST(${String(usdCnyRate)} AS numeric)
            ) FILTER (
              WHERE o."paidAt" IS NOT NULL
                AND o."status" NOT IN ('CANCELLED', 'REFUNDED')
            ), 0)::text AS "paidCny"
          FROM orders o
          WHERE o."userId" IN (${Prisma.join(ids)})
          GROUP BY o."userId"
        `
      : [];

  const agg = new Map<
    string,
    { paidCount: number; paidCny: number; lastOrderAt: Date | null }
  >();
  for (const r of aggRows) {
    agg.set(r.userId, {
      paidCount: r.paidCount,
      paidCny: Number(r.paidCny ?? 0),
      lastOrderAt: r.lastOrderAt ? new Date(r.lastOrderAt) : null,
    });
  }

  const enriched = rows.map((r) => ({
    ...r,
    paidOrderCount: agg.get(r.id)?.paidCount ?? 0,
    paidCny: Math.round((agg.get(r.id)?.paidCny ?? 0) * 100) / 100,
    lastOrderAt: agg.get(r.id)?.lastOrderAt ?? null,
  }));

  return jsonPaginated(enriched, {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});
