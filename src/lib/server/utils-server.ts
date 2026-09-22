import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";

/**
 * 客户端标识（仅服务端使用）：限流与审计的「谁」。
 *
 * 安全口径（商业交付缺陷 B1 修复前的问题）：
 * - 原实现 `TRUST_PROXY=false` 时一律返回 `"unknown"` —— **全体客户端共享一个限流桶**：
 *   注册 3/min、下单 5/10min 全部塌缩成全站额度，一个攻击者打满额度即可让**所有用户**
 *   无法注册/下单（单点 DoS）；审计日志里也全是 "unknown"，无法追溯。
 * - 现方案：无可信 IP 时退化为**请求头指纹**（同一客户端稳定、不同客户端可区分），
 *   绝不返回单一常量桶。
 *
 * 部署契约（不可省略）：
 * - `TRUST_PROXY=true`（生产默认）信任代理追加的 `X-Forwarded-For` 最后一跳与 `x-real-ip`；
 *   该信任**要求应用端口不直接对外**（compose 已把 3000 绑定到 127.0.0.1，仅反代可达），
 *   否则直连者可自带 XFF 轮换 IP 绕过限流。反代侧建议覆盖写入：
 *   `proxy_set_header X-Forwarded-For $remote_addr;`
 * - `TRUST_PROXY=false`：不信任任何转发头，走指纹兜底（限流不会塌缩，但指纹可被轮换，
 *   因此高风险端点另设全局熔断额度，见 rate-limit.ts 的 globalLimit）。
 *
 * 独立成文件是为了让 client 侧 utils.ts 不被 env.ts 拖入 bundle
 * （env.ts 顶层会执行 JWT 密钥 fail-fast，不能进 client bundle）。
 */
export function getClientIp(req: Request): string {
  if (env.TRUST_PROXY) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      // 最后一跳 = 最近的可信代理追加的地址；客户端伪造的前缀条目被忽略
      if (parts.length > 0) return parts[parts.length - 1]!;
    }
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
  }
  return clientFingerprint(req);
}

/**
 * 无可信 IP 时的客户端指纹。
 *
 * 用「UA + Accept-Language + sec-ch-ua + sec-ch-ua-platform」做 SHA-256 短哈希：
 * 真实浏览器这些头稳定且组合空间极大，可近似区分客户端；
 * 绝不能退化为「每次请求随机」（那等于不限流）。
 *
 * 注意：指纹是客户端可控的（攻击者可轮换 UA 绕过单桶限额），
 * 所以它只是「避免全站塌缩」的兜底，真正的兜底是高风险端点的 globalLimit 熔断。
 */
export function clientFingerprint(req: Request): string {
  const seed = [
    req.headers.get("user-agent") ?? "",
    req.headers.get("accept-language") ?? "",
    req.headers.get("sec-ch-ua") ?? "",
    req.headers.get("sec-ch-ua-platform") ?? "",
  ].join("|");
  // 全空（裸脚本、无任何头）：仍给一个独立桶名前缀，语义上标注「未知来源」
  if (seed.replace(/\|/g, "").trim().length === 0) return "anon:no-headers";
  return `anon:${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}
