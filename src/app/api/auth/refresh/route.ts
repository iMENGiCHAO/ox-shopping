import { apiHandler, json } from "@/lib/api";
import { ApiError, rateLimited, unauthorized } from "@/lib/errors";
import { rotateSession, setAuthCookies } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { getClientIp } from "@/lib/server/utils-server";
import { REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import { logger } from "@/lib/logger";

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
  // R1 安全加固：频率上限从 60/分钟降至 10/分钟（正常用户无需频繁刷新）
  const rl = await rateLimit({ key: `refresh:${getClientIp(req)}`, ...RATE_LIMITS.refresh });
  if (!rl.ok) {
    logger.warn({ ip: getClientIp(req) }, "refresh token 频率超限");
    throw rateLimited();
  }

  const refreshToken = readCookie(req, REFRESH_TOKEN_COOKIE);
  if (!refreshToken) throw unauthorized("Please sign in first");

  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? "unknown";

  try {
    const rotated = await rotateSession(refreshToken);
    // R1 审计：记录正常轮换（含 IP/UA，便于后续异常追溯）
    logger.info({ userId: rotated.user.id, ip, ua }, "refresh token 轮换成功");
    const res = json({ user: rotated.user });
    setAuthCookies(res, { accessToken: rotated.accessToken, refreshToken: rotated.refreshToken });
    return res;
  } catch (e) {
    // 重放/善意复用的审计已在 rotateSession 内记录，此处补充 IP/UA。
    // **按错误码判断，不要按文案子串** —— 文案会随语言与措辞变化
    // （此前写的是 `e.message.includes("异常登录")`，错误文案一本地化就静默失效）。
    if (e instanceof ApiError && e.code === "REPLAY_DETECTED") {
      logger.warn({ ip, ua }, "refresh token 重放被拦截（已吊销全部会话）");
    }
    throw e;
  }
});
