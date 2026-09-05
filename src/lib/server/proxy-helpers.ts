import { randomBytes } from "node:crypto";

/**
 * Proxy 中间件纯函数模块（P1-2 职责拆分）：
 * 把 CSP 构造 / nonce 生成从 src/proxy.ts 中解耦为无副作用纯函数，
 * proxy.ts 只做编排，行为与拆分前完全一致。
 *
 * 注意：CSRF 豁免清单、admin 守卫、请求 ID、生产 CSP 的 nonce + strict-dynamic 结构
 * 属于承重墙（见 docs/ARCHITECTURE_REVIEW_2026-09.md §1 W3/W4），本模块仅做等价迁移，
 * 不改变其语义。
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
 * 构造 CSP 头字符串。
 * @param nonce   生产模式 per-request nonce；开发模式传空串（不产生 nonce 指令）
 * @param isProd  是否生产环境（决定 strict-dynamic 与宽松策略）
 */
export function buildCsp(nonce: string, isProd: boolean): string {
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`
    : `'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com`;
  const imgSrc = isProd
    ? "'self' data: blob: https://picsum.photos https://images.unsplash.com https://*.amazonaws.com"
    : "'self' data: blob: https://picsum.photos https://images.unsplash.com http://localhost:*";
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