import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE, REQUEST_ID_HEADER } from "@/lib/constants";
import { CSRF_COOKIE, generateCsrfToken, validateCsrf } from "@/lib/auth/csrf";
import { randomNonce, buildCsp } from "@/lib/server/proxy-helpers";

/**
 * Next 16 Proxy（原 Middleware，已在 16.0 弃用 middleware 并改名为 proxy）：
 * 1. 请求 ID 注入(日志追踪)
 * 2. CSP 响应头（生产 per-request nonce + strict-dynamic；开发宽松以放行 HMR）
 * 3. CSRF double-submit 校验(变更请求)
 * 4. /admin 页面路由守卫(JWT 校验 + 角色)
 *
 * 运行：Next 16 默认 Node.js runtime（jose 验证 / crypto.randomUUID 都需要 Node）。
 *   - 出口 `export function proxy(...)` 是 Next 16 的约定名
 *   - 旧 `middleware.ts` 已被弃用，详见 node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 */

const CSRF_EXEMPT_PREFIXES = [
  "/api/webhooks/",
  "/api/auth/csrf",
  "/api/uploads/",
  "/api/healthz",
  // 游客可调：售罄商品到货通知订阅（已用 rate-limit(5/h) + 同 email+product 去重防御滥用）
  "/api/notify-me",
];
const PUBLIC_PATHS = ["/healthz", "/favicon.ico", "/_next", "/uploads", "/fonts"];

function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * 路由级 locale（P1-1 第一步）：识别 `/zh` `/en` 前缀并返回去掉前缀后的路径。
 * 无前缀 = 英文（默认，不破坏现有链接/收录）；`/zh` = 中文，`/en` = 显式英文。
 * 仅作用于商城前台路由；`/api` `/admin` `/healthz` 等不受影响。
 */
function parseLocalePrefix(pathname: string): { lang: "zh" | "en" | null; rest: string } {
  const m = /^\/(zh|en)(?=\/|$)/.exec(pathname);
  if (!m) return { lang: null, rest: pathname };
  const lang = m[1] as "zh" | "en";
  const rest = pathname.slice(m[0].length) || "/";
  // 只对商城前台生效：/zh/admin 之类保留原样（不该出现，防御性不处理）
  if (rest.startsWith("/api") || rest.startsWith("/admin") || rest.startsWith("/healthz")) {
    return { lang: null, rest: pathname };
  }
  return { lang, rest };
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---------- 路由级 locale 识别 ----------
  const locale = parseLocalePrefix(pathname);

  // ---------- 请求 ID ----------
  let requestId = req.headers.get(REQUEST_ID_HEADER);
  if (!requestId) {
    requestId = crypto.randomUUID();
  }
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  // 供服务端组件(如 /admin layout)判断当前路径(headers() 不提供 pathname)
  requestHeaders.set("x-pathname", pathname);
  // 路由级语言信号（getLang() 优先读它，使 SSR 语言感知）
  if (locale.lang) requestHeaders.set("x-lang", locale.lang);

  // ---------- CSP（生产：per-request nonce + strict-dynamic）----------
  // 开发模式保留宽松策略(HMR 依赖 eval/inline)；生产由 proxy 按请求签发 nonce，
  // Next 检测到请求头 CSP 含 nonce 后会自动写入其自有 bootstrap 脚本。
  const isProd = process.env.NODE_ENV === "production";
  // 路由级 locale：有前缀时 rewrite 到去前缀路径（URL 仍显示 /zh|/en，内部路由命中 shop）
  const rewriteUrl = locale.lang ? new URL(locale.rest, req.url) : undefined;

  if (isProd && !isPublicPath(pathname)) {
    const nonce = randomNonce();
    requestHeaders.set("x-nonce", nonce);
    const csp = buildCsp(nonce, true);
    requestHeaders.set("Content-Security-Policy", csp);
    const cspRes = rewriteUrl
      ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });
    cspRes.headers.set("Content-Security-Policy", csp);
    cspRes.headers.set(REQUEST_ID_HEADER, requestId);
    return cspRes;
  }

  // 公开路径仅透传请求 ID
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const res = rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(REQUEST_ID_HEADER, requestId);

  // 开发模式：宽松 CSP（HMR 需要 eval/inline）
  if (!isProd) {
    res.headers.set("Content-Security-Policy", buildCsp("", false));
  }

  // ---------- CSRF：变更请求校验 ----------
  const method = req.method.toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const isApi = pathname.startsWith("/api/");

  if (isApi && isMutation && !isCsrfExempt(pathname)) {
    if (!validateCsrf(req)) {
      return NextResponse.json(
        { error: { code: "CSRF_FAILED", message: "CSRF 校验失败，请刷新页面后重试" } },
        { status: 403, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }
  }

  // GET 请求确保 Cookie 存在(供前端读取后回填请求头)
  if (isApi && method === "GET" && !req.cookies.get(CSRF_COOKIE)) {
    res.cookies.set(CSRF_COOKIE, generateCsrfToken(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 3600,
    });
  }

  // ---------- /admin 路由守卫 ----------
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const payload = token ? await verifyAccessToken(token) : null;
    const allowed = payload && (payload.role === "ADMIN" || payload.role === "SUPPORT");
    if (!allowed) {
      const loginUrl = new URL("/admin/login", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return res;
}

export const config = {
  // 排除静态资源与图片优化路由，降低中间件开销
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
