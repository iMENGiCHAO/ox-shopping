import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { parsePagination } from "@/lib/utils";
import type { CommissionState } from "@/lib/distribution/contract";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { listMyCommissions } from "@/server/services/distribution";

export const runtime = "nodejs";

const STATES: CommissionState[] = ["PENDING", "SETTLED", "REVERSED"];

/** GET /api/distribution/my/commissions — 我的佣金明细（行级权限：只查自己） */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip, take } = parsePagination(sp, { page: 1, pageSize: 20 });
  const status = searchParam(sp, "status");

  const { rows, total } = await listMyCommissions(user.id, {
    skip,
    take,
    ...(status && (STATES as string[]).includes(status)
      ? { status: status as CommissionState }
      : {}),
  });
  return jsonPaginated(rows, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
