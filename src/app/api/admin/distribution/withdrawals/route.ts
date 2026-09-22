import { apiHandler, json, searchParam } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { parsePagination } from "@/lib/utils";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { listWithdrawals } from "@/server/services/distribution";

export const runtime = "nodejs";

const STATUSES = ["PENDING", "APPROVED", "PAID", "REJECTED"] as const;

/** GET /api/admin/distribution/withdrawals — 提现单列表（含各状态计数） */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip, take } = parsePagination(sp, { page: 1, pageSize: 10 });
  const status = searchParam(sp, "status");

  const { rows, total, counts } = await listWithdrawals({
    skip,
    take,
    ...(status && (STATUSES as readonly string[]).includes(status)
      ? { status: status as (typeof STATUSES)[number] }
      : {}),
  });
  return json({
    data: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    counts,
  });
});
