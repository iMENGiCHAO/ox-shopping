import { randomToken } from "@/lib/utils";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/constants";

/**
 * CSRF 防护：double-submit cookie。
 * - 中间件在任意 GET 请求时下发随机 csrf_token Cookie(JS 可读)
 * - 所有变更请求(POST/PUT/PATCH/DELETE)必须携带同值 x-csrf-token 请求头
 * - 攻击者跨站无法读取 Cookie 内容，故无法伪造请求头
 * - 叠加 SameSite=Lax 双保险
 */

export function generateCsrfToken(): string {
  return randomToken(32);
}

/** 从请求提取 CSRF 头(供服务端二次校验) */
export function getCsrfHeader(req: Request): string {
  return req.headers.get(CSRF_HEADER) ?? "";
}

/** 从请求提取 CSRF Cookie */
export function getCsrfCookie(req: Request): string {
  const header = req.headers.get("cookie") ?? "";
  const match = header.split("; ").find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : "";
}

/** 变更请求 CSRF 校验 */
export function validateCsrf(req: Request): boolean {
  const cookie = getCsrfCookie(req);
  const header = getCsrfHeader(req);
  return cookie.length >= 32 && cookie === header;
}

export { CSRF_COOKIE, CSRF_HEADER };
