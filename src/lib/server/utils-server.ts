import "server-only";
import { env } from "@/lib/env";

/**
 * 客户端 IP（仅服务端使用）。
 * TRUST_PROXY=true（生产默认）：取 X-Forwarded-For 最后一跳——该条目由可信反代追加，
 * 客户端伪造的前缀条目被忽略；配合 nginx `X-Forwarded-For $remote_addr` 覆盖写入即不可伪造。
 * TRUST_PROXY=false：不信任任何转发头，返回 unknown（限流按桶收敛，防止伪造绕过）。
 *
 * 独立成文件是为了让 client 侧 utils.ts 不被 env.ts 拖入 bundle
 * （env.ts 顶层会执行 JWT 密钥 fail-fast，不能进 client bundle）。
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded && env.TRUST_PROXY) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && env.TRUST_PROXY) return realIp.trim();
  return "unknown";
}
