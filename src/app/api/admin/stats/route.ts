import { apiHandler, json } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { getAdminStats } from "@/server/services/stats.service";

export const runtime = "nodejs";

/**
 * GET /api/admin/stats — 管理端仪表盘统计。
 *
 * 定位说明（防「无调用方」误判）：仪表盘页是 server 组件，直接引用
 * `getAdminStats()` 服务，不走此 HTTP 端点。本路由保留给：
 * 1. 集成测试 RBAC 探活（tests/integration/admin.test.ts「ADMIN 访问统计 → 200」）；
 * 2. 外部监控/脚本按需拉取同一份数据（与页面同源同口径）。
 */
export const GET = apiHandler(async () => {
  await requireStaff();
  const stats = await getAdminStats();
  return json(stats);
});
