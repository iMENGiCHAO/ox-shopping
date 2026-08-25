import { apiHandler, json } from "@/lib/api";
import { CSRF_COOKIE, generateCsrfToken, getCsrfCookie } from "@/lib/auth/csrf";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * GET /api/auth/csrf
 * CSRF 兜底：中间件在 GET /api 时已下发 Cookie；这里再生成并返回同一 Cookie 值。
 */
export const GET = apiHandler(async (req) => {
  const existing = getCsrfCookie(req);
  if (existing) return json({ token: existing });

  const token = generateCsrfToken();
  const res = json({ token });
  res.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 3600,
  });
  return res;
});
