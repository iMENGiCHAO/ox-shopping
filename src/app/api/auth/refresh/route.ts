import { apiHandler, json } from "@/lib/api";
import { rateLimited, unauthorized } from "@/lib/errors";
import { rotateSession, setAuthCookies } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/utils";
import { REFRESH_TOKEN_COOKIE } from "@/lib/constants";

export const runtime = "nodejs";

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

/** POST /api/auth/refresh — 用 refresh token 轮换会话 */
export const POST = apiHandler(async (req) => {
  const rl = await rateLimit({ key: `refresh:${getClientIp(req)}`, limit: 60, windowSeconds: 60 });
  if (!rl.ok) throw rateLimited();

  const refreshToken = readCookie(req, REFRESH_TOKEN_COOKIE);
  if (!refreshToken) throw unauthorized("请先登录");

  const rotated = await rotateSession(refreshToken);
  const res = json({ user: rotated.user });
  setAuthCookies(res, { accessToken: rotated.accessToken, refreshToken: rotated.refreshToken });
  return res;
});
