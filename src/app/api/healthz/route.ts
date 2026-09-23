import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/healthz — 进程存活探针（livez）。
 *
 * 刻意不访问数据库或任何外部依赖：即使 PostgreSQL/Redis 暂时不可用，进程仍应保持
 * 存活，交由 readiness 摘流量，避免依赖故障触发无意义的容器重启。
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", probe: "livez", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
