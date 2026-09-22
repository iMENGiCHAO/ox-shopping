import { apiHandler, jsonPaginated } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { parsePagination } from "@/lib/utils";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { listMyWithdrawals } from "@/server/services/distribution";

export const runtime = "nodejs";

/** GET /api/distribution/my/withdrawals — 我的提现记录（收款账户只回显尾号） */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  const user = await requireUser();
  const { page, pageSize, skip, take } = parsePagination(new URL(req.url).searchParams, {
    page: 1,
    pageSize: 10,
  });

  const { rows, total } = await listMyWithdrawals(user.id, { skip, take });
  return jsonPaginated(rows, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
