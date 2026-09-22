import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { parsePagination } from "@/lib/utils";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getMyCustomers } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * GET /api/distribution/my/customers — 我的直接客户。
 * 行级权限：只查 `distributorId = 当前登录用户`；手机号/邮箱在服务端脱敏。
 */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip, take } = parsePagination(sp, { page: 1, pageSize: 10 });
  const q = searchParam(sp, "q");

  const { rows, total } = await getMyCustomers(user.id, { skip, take, ...(q ? { q } : {}) });
  return jsonPaginated(rows, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
