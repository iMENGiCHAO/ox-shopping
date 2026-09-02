import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
// 健康检查不能被缓存或走 edge
export const dynamic = "force-dynamic";

/**
 * GET /api/healthz — 存活 + 就绪探针（Docker HEALTHCHECK 使用）
 *
 * 语义：
 *  - 进程存活即 200（只要 Node 在跑）
 *  - DB 可达且可执行简单查询 → 返回 200 + { db: "ok" }
 *  - DB 不可达 → 仍返回 200（进程存活），但附带 db: "down"，
 *    供编排层（k8s readinessProbe）区分"活着"与"就绪"
 *
 * 注意：proxy.ts 的 PUBLIC_PATHS 包含 /healthz 前缀；对外路径是 /healthz
 * （路由目录 healthz，不带 /api 前缀也会被 proxy 命中 PUBLIC_PATHS 前缀）。
 */
export async function GET() {
  let db = "ok";
  try {
    // 2s 超时：不阻塞健康检查
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rej) => setTimeout(() => rej(new Error("db timeout")), 2000)),
    ]);
  } catch {
    db = "down";
  }
  return NextResponse.json(
    { status: "ok", db, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
