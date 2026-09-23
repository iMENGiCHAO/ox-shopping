import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 2_000;

/**
 * GET /healthz — 服务就绪探针（readyz）。
 *
 * 真实执行轻量 SQL；数据库不可达、认证失败或超时均返回 503，让 Nginx/容器编排停止
 * 发送流量。与 GET /api/healthz 的纯进程存活探针分离，避免 DB 故障造成重启风暴。
 */
export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("database readiness timeout")), DB_TIMEOUT_MS);
      }),
    ]);
    return NextResponse.json(
      { status: "ok", probe: "readyz", database: "ok", time: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        probe: "readyz",
        database: "down",
        time: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
