import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { parsePagination } from "@/lib/utils";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getMyTeamOrders } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * GET /api/distribution/my/orders — 我的团队订单。
 *
 * 只返回**直接客户**的订单明细（归属分销商=我）；间接下级订单只进汇总接口，
 * 这是产品文档「间接下级只看汇总，不看具体客户和订单明细」的落地。
 */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip, take } = parsePagination(sp, { page: 1, pageSize: 10 });
  const status = searchParam(sp, "status");

  const { rows, total } = await getMyTeamOrders(user.id, {
    skip,
    take,
    ...(status ? { status } : {}),
  });
  return jsonPaginated(rows, {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
