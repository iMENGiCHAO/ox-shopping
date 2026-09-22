import { apiHandler, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getAdminOverview } from "@/server/services/distribution";

export const runtime = "nodejs";

/** GET /api/admin/distribution/overview — 分销总览（分销商数/团队关系/待处理提现/佣金三态） */
export const GET = apiHandler(async () => {
  assertDistributionEnabled();
  await requireAdmin();
  return json(await getAdminOverview());
});
