import { NextResponse } from "next/server";

/** 健康检查(docker-compose healthcheck 使用) */
export async function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() });
}
