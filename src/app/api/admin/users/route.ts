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
  const ids = rows.map((r) => r.id);
  const [orders, usdCnyRate] = await Promise.all([
    ids.length
      ? prisma.order.findMany({
          where: { userId: { in: ids } },
          select: {
            userId: true,
            total: true,
            currency: true,
            exchangeRate: true,
            createdAt: true,
            status: true,
            paidAt: true,
          },
        })
      : Promise.resolve([]),
    getRateSnapshot().then((s) => s.rates["CNY"] ?? 7.2),
  ]);

  const agg = new Map<string, { paidCount: number; paidCny: number; lastOrderAt: Date | null }>();
  for (const o of orders) {
    // 游客订单 userId 为 null：不归属任何用户，跳过（聚合口径只统计注册用户）
    if (!o.userId) continue;
    const a = agg.get(o.userId) ?? { paidCount: 0, paidCny: 0, lastOrderAt: null };
    a.lastOrderAt = !a.lastOrderAt || o.createdAt > a.lastOrderAt ? o.createdAt : a.lastOrderAt;
    if (o.paidAt && o.status !== "CANCELLED" && o.status !== "REFUNDED") {
      a.paidCount += 1;
      const rate = Number(o.exchangeRate ?? 1);
      const usd =
        o.currency === "USD" || !rate || rate <= 0 ? Number(o.total) : Number(o.total) / rate;
      a.paidCny += usd * usdCnyRate;
    }
    agg.set(o.userId, a);
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
