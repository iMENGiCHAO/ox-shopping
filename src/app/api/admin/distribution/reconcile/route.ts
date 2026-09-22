import { apiHandler, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { reconcileDistribution } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * POST /api/admin/distribution/reconcile — 手动触发对账补偿（运维/验收用）。
 * 与调度器每分钟跑的是同一个幂等函数：补归属、补佣金、冲正退款单、到期结算。
 */
export const POST = apiHandler(async () => {
  assertDistributionEnabled();
  await requireAdmin();
  const result = await reconcileDistribution();
  return json({ ok: true, ...result });
});
