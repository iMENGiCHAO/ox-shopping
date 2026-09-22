import { apiHandler, json, searchParam } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getAdminOverview, getAdminReport } from "@/server/services/distribution";

export const runtime = "nodejs";

/** GET /api/admin/distribution/reports?days=30 — 对账报表（佣金支出 vs 收入 vs 毛估） */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  await requireAdmin();
  const raw = Number(searchParam(new URL(req.url).searchParams, "days") ?? 30);
  const days = Number.isInteger(raw) && raw > 0 && raw <= 365 ? raw : 30;
  const [report, overview] = await Promise.all([getAdminReport(days), getAdminOverview()]);
  return json({ report, overview });
});
