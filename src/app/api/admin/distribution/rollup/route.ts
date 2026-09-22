import { apiHandler, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { rollupDistributionDailyStats } from "@/server/services/distribution";

export const runtime = "nodejs";

/** POST /api/admin/distribution/rollup — 手动重跑团队业绩日汇总（P2-12，幂等） */
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
