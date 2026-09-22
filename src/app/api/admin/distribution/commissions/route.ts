import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { parsePagination } from "@/lib/utils";
import type { CommissionState } from "@/lib/distribution/contract";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getAdminCommissionLogs } from "@/server/services/distribution";

export const runtime = "nodejs";

const STATES: CommissionState[] = ["PENDING", "SETTLED", "REVERSED"];

/** GET /api/admin/distribution/commissions — 全量佣金流水（可筛状态/订单号） */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip, take } = parsePagination(sp, { page: 1, pageSize: 20 });
  const status = searchParam(sp, "status");
  const orderNumber = searchParam(sp, "orderNumber");

  const { rows, total } = await getAdminCommissionLogs({
    skip,
    take,
    ...(status && (STATES as string[]).includes(status)
      ? { status: status as CommissionState }
      : {}),
    ...(orderNumber ? { orderNumber } : {}),
  });
  return jsonPaginated(rows, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
