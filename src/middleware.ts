import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE, REQUEST_ID_HEADER } from "@/lib/constants";
import { CSRF_COOKIE, generateCsrfToken, validateCsrf } from "@/lib/auth/csrf";

/**
 * Edge 中间件(保持轻量，不依赖 Node 运行时)：
 * 1. 请求 ID 注入(日志追踪)
 * 2. CSRF double-submit 校验(变更请求)
 * 3. /admin 页面路由守卫(JWT 校验 + 角色)
 */

const CSRF_EXEMPT_PREFIXES = ["/api/webhooks/", "/api/auth/csrf", "/api/uploads/", "/api/healthz"];
const PUBLIC_PATHS = ["/healthz", "/favicon.ico", "/_next", "/uploads", "/fonts"];

function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---------- 请求 ID ----------
  let requestId = req.headers.get(REQUEST_ID_HEADER);
  if (!requestId) {
    requestId = crypto.randomUUID();
  }
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  // 供服务端组件(如 /admin layout)判断当前路径(headers() 不提供 pathname)
  requestHeaders.set("x-pathname", pathname);

  // 公开路径仅透传请求 ID
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(REQUEST_ID_HEADER, requestId);

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
