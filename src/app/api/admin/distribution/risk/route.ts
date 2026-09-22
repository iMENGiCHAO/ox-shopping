import { apiHandler, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getRiskReport } from "@/server/services/distribution";

export const runtime = "nodejs";

/** GET /api/admin/distribution/risk — 风控视图（自购/负余额/高频退款/大额提现/超层级规则） */
export const GET = apiHandler(async () => {
  assertDistributionEnabled();
  await requireAdmin();
  return json(await getRiskReport());
});
