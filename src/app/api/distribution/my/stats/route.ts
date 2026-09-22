import { apiHandler, json, searchParam } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getTeamStats } from "@/server/services/distribution";

export const runtime = "nodejs";

/** GET /api/distribution/my/stats — 团队业绩（含间接下级汇总；可按天数取窗口） */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  const user = await requireUser();
  const raw = Number(searchParam(new URL(req.url).searchParams, "days") ?? 30);
  const days = Number.isInteger(raw) && raw > 0 && raw <= 365 ? raw : 30;
  const stats = await getTeamStats(user.id, days);
  return json({ days, ...stats });
});
