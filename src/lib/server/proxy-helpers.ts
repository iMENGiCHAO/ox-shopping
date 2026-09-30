import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Proxy 中间件纯函数模块（P1-2 职责拆分）：
 * 把 CSP 构造 / nonce 生成从 src/proxy.ts 中解耦为无副作用纯函数，
 * proxy.ts 只做编排，行为与拆分前完全一致。
 *
 * 注意：CSRF 豁免清单、admin 守卫、请求 ID、生产 CSP 的 nonce + strict-dynamic 结构
 * 属于承重墙（安全关键路径），本模块仅做等价迁移，不改变其语义。
 */

/**
 * 生成 CSP nonce：128 位无偏随机数的 base64。
 * 旧实现 `btoa(crypto.randomUUID())` 仅 122 bit 且含固定位（UUID 版本/变体位），
 * 用于 nonce 有偏；改用 randomBytes(16) 保证等概率 128 bit。
 * base64 可能含 + / =，符合 CSP `base64-value` 语法，与旧 btoa 输出同域，无回归。
 */
export function randomNonce(): string {
  return randomBytes(16).toString("base64");
}

/**
 * S3 公网图床主机（P2-2 商用审计）：从 S3_PUBLIC_URL 派生。
 * S3 模式的商品图直接指向该 URL（支持 AWS / MinIO / R2 / 任意 CDN），
 * CSP img-src 若只白名单 `https://*.amazonaws.com`，非 AWS 部署的商品图
 * 会被 CSP 全部拦截（前台图全挂）。未配置（本地存储模式）返回 null。
 */
function s3ImageHost(): string | null {
  const raw = env.S3_PUBLIC_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).host || null;
  } catch {
    return null;
  }
}

/**
 * 构造 CSP 头字符串。
 * @param nonce   生产模式 per-request nonce；开发模式传空串（不产生 nonce 指令）
 * @param isProd  是否生产环境（决定 strict-dynamic 与宽松策略）
 */
export function buildCsp(nonce: string, isProd: boolean): string {
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`
    : `'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com`;
  // img-src 追加 S3 图床主机（配置派生，不写死云厂商 —— MinIO/R2/CDN 部署可用）
  const s3Host = s3ImageHost();
  const s3Directive = s3Host ? ` https://${s3Host}` : "";
  const imgSrc = isProd
    ? `'self' data: blob: https://*.amazonaws.com${s3Directive}`
    : `'self' data: blob: http://localhost:*${s3Directive}`;
  const connectSrc = isProd
    ? "'self' https://api.stripe.com"
    : "'self' https://api.stripe.com http://localhost:* ws:";

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
  ];
  if (isProd) directives.push("frame-ancestors 'self'");
  return directives.join("; ");
}