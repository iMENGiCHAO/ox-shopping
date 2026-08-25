import { apiHandler, json } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { getAdminStats } from "@/server/services/stats.service";

export const runtime = "nodejs";

/** GET /api/admin/stats — 管理端仪表盘统计 */
export const GET = apiHandler(async () => {
  await requireStaff();
  const stats = await getAdminStats();
  return json(stats);
});
