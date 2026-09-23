import { apiHandler, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { rollupDistributionDailyStats } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * POST /api/admin/distribution/rollup — 手动重跑团队业绩日汇总（P2-12，幂等）。
 *
 * 定位说明（防「无调用方」误判）：正常链路由商城钩子（bridge.ts）在下单/支付/
 * 退款后自动调 service 层重算，**不经此端点**。此路由是运维/巡检的人工补算
 * 入口（数据漂移后手动重跑），刻意保留、无 UI 入口。
 */
export const POST = apiHandler(async (req) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const result = await rollupDistributionDailyStats({ days: 3 });
  await audit({
    userId: actor.id,
    action: "DISTRIBUTION_ROLLUP",
    meta: { ...result },
    req,
  });
  return json({ ok: true, ...result });
});
