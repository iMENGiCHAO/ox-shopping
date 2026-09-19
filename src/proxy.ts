import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REQUEST_ID_HEADER,
} from "@/lib/constants";
import { CSRF_COOKIE, generateCsrfToken, validateCsrf } from "@/lib/auth/csrf";
import { randomNonce, buildCsp } from "@/lib/server/proxy-helpers";
import { langFromCookies } from "@/lib/request-lang";
import { localizeErrorMessage } from "@/lib/error-i18n";
import { env } from "@/lib/env";

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
 *
 * ⚠️ 顺序约束（安全关键）：CSP 的构造只是**准备**响应，绝不能提前 return；
 *    必须继续执行 CSRF 校验与 /admin 守卫，最后统一返回同一个 res。
 *    （历史 bug：生产 CSP 分支提前 return，导致 CSRF 与 admin 守卫在生产环境完全失效。）
 */

const CSRF_EXEMPT_PREFIXES = [
  "/api/webhooks/",
  "/api/auth/csrf",
  "/api/uploads/",
  "/api/healthz",
  // 游客可调：售罄商品到货通知订阅（已用 rate-limit(5/h) + 同 email+product 去重防御滥用）
  "/api/notify-me",
  // 支付渠道统一异步回调（支付宝/微信等第三方网关回调，无 CSRF token；验签在 handler 内完成）
  "/api/pay/notify/",
];
const PUBLIC_PATHS = ["/healthz", "/favicon.ico", "/_next", "/uploads", "/fonts"];

function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

/** 在 Cookie 请求头字符串里 upsert 一个键值（用于静默续期后同步给后续 RSC/Route Handler） */
function upsertCookieHeader(cookieHeader: string, name: string, value: string): string {
  const parts = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith(`${name}=`));
  parts.push(`${name}=${value}`);
  return parts.join("; ");
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

  // ---------- 旧链接迁移：/products?category=<slug> → /collections/<slug> ----------
  // 原站集合页 URL 形态是 /collections/<slug>（2026-09-20 实测 200），本地历史形态
  // 是 /products?category=<slug>。在中间件层做 307，避免旧链接落到索引页造成死链体验；
  // 保留 /zh|/en 前缀，避免中文用户被甩到英文站。
  {
    const categorySlug = req.nextUrl.searchParams.get("category")?.trim();
    if (locale.rest === "/products" && categorySlug) {
      const prefix = locale.lang ? `/${locale.lang}` : "";
      const target = new URL(
        `${prefix}/collections/${encodeURIComponent(categorySlug)}`,
        req.url,
      );
      return NextResponse.redirect(target, 307);
    }
  }

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

  const isProd = process.env.NODE_ENV === "production";
  const isPublic = isPublicPath(pathname);

  // 路由级 locale：有前缀时 rewrite 到去前缀路径（URL 仍显示 /zh|/en，内部路由命中 shop）
  // R2 修复：new URL(rest, req.url) 会丢弃原 query（如 /zh/search?q=tee → /search），
  // 必须显式回填 req.nextUrl.search，否则带参 /zh 页面全部失效。
  const rewriteUrl = locale.lang ? new URL(locale.rest, req.url) : undefined;
  if (rewriteUrl) rewriteUrl.search = req.nextUrl.search;

  const makeResponse = () =>
    rewriteUrl
      ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });

  // 公开路径仅透传请求 ID（不注入 CSP/CSRF，降低静态资源开销）
  if (isPublic) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ---------- 静默续期 ----------
  // access_token(15min) 过期但 refresh_token(7d) 有效时，自动轮换并写回 cookie，
  // 否则用户每 15 分钟被登出一次（"7 天免登录"形同虚设）。
  // 仅在 access 无效时才查库，命中频率 = 每用户每 15 分钟一次。
  let rotatedTokens: { accessToken: string; refreshToken: string } | null = null;
  {
    const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const accessPayload = accessToken ? await verifyAccessToken(accessToken) : null;
    if (!accessPayload) {
      const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
      if (refreshToken) {
        try {
          const { rotateSession } = await import("@/lib/auth/session");
          const rotated = await rotateSession(refreshToken);
          rotatedTokens = { accessToken: rotated.accessToken, refreshToken: rotated.refreshToken };
        } catch {
          // 刷新失败（过期 / 重放检测触发）：按未登录处理，不阻断请求
        }
      }
    }
  }
  if (rotatedTokens) {
    let cookieHeader = requestHeaders.get("cookie") ?? "";
    cookieHeader = upsertCookieHeader(cookieHeader, ACCESS_TOKEN_COOKIE, rotatedTokens.accessToken);
    cookieHeader = upsertCookieHeader(cookieHeader, REFRESH_TOKEN_COOKIE, rotatedTokens.refreshToken);
    requestHeaders.set("cookie", cookieHeader);
  }

  // ---------- CSP（仅准备，不 return）----------
  let csp: string | null = null;
  if (isProd) {
    const nonce = randomNonce();
    requestHeaders.set("x-nonce", nonce);
    csp = buildCsp(nonce, true);
    requestHeaders.set("Content-Security-Policy", csp);
  }

  const res = makeResponse();
  res.headers.set(REQUEST_ID_HEADER, requestId);
  if (csp) {
    res.headers.set("Content-Security-Policy", csp);
  } else {
    // 开发模式：宽松 CSP（HMR 需要 eval/inline）
    res.headers.set("Content-Security-Policy", buildCsp("", false));
  }

  // 静默续期成功：把新 token 写入响应 Cookie（浏览器侧生效）
  if (rotatedTokens) {
    const cookieOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax" as const,
      path: "/",
      domain: env.COOKIE_DOMAIN || undefined,
    };
    res.cookies.set(ACCESS_TOKEN_COOKIE, rotatedTokens.accessToken, {
      ...cookieOpts,
      maxAge: env.ACCESS_TOKEN_TTL,
    });
    res.cookies.set(REFRESH_TOKEN_COOKIE, rotatedTokens.refreshToken, {
      ...cookieOpts,
      maxAge: env.REFRESH_TOKEN_TTL,
    });
  }

  // ---------- CSRF：变更请求校验（生产/开发均必须执行）----------
  const method = req.method.toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const isApi = pathname.startsWith("/api/");

  if (isApi && isMutation && !isCsrfExempt(pathname)) {
    if (!validateCsrf(req)) {
      // 文案走 error-i18n：英文原文 + 按请求语言本地化，
      // 避免把中文写死在这里（proxy 不在 apiHandler 链路内，需自行本地化）。
      const lang = langFromCookies((name) => req.cookies.get(name)?.value);
      const errRes = NextResponse.json(
        {
          error: {
            code: "CSRF_FAILED",
            message: localizeErrorMessage("CSRF validation failed, please refresh and retry", lang),
          },
        },
        { status: 403, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
      if (csp) errRes.headers.set("Content-Security-Policy", csp);
      return errRes;
    }
  }

  // GET 请求确保 Cookie 存在(供前端读取后回填请求头)
  if (isApi && method === "GET" && !req.cookies.get(CSRF_COOKIE)) {
    res.cookies.set(CSRF_COOKIE, generateCsrfToken(), {
      httpOnly: false,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 3600,
    });
  }

  // ---------- /admin 路由守卫（生产/开发均必须执行）----------
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = rotatedTokens?.accessToken ?? req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
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
