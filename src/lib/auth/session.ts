import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Role, User } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/utils";
import {
  ACCESS_TOKEN_COOKIE,
  LOGGED_IN_COOKIE,
  PASSWORD_CHANGE_REQUIRED_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/constants";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "@/lib/auth/jwt";
import {
  forbidden,
  passwordChangeRequired,
  replayDetected,
  unauthorized,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { SessionUser } from "@/types/api";

/** cookie 属性：httpOnly + Secure(生产) + SameSite=Lax */
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    domain: env.COOKIE_DOMAIN || undefined,
  };
}

/** 为响应设置双 token Cookie（另附一个 JS 可读的登录态提示 cookie） */
export function setAuthCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, cookieOptions(env.ACCESS_TOKEN_TTL));
  res.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, cookieOptions(env.REFRESH_TOKEN_TTL));
  res.cookies.set(LOGGED_IN_COOKIE, "1", {
    ...cookieOptions(env.REFRESH_TOKEN_TTL),
    httpOnly: false,
  });
}

export function clearAuthCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_TOKEN_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  res.cookies.set(REFRESH_TOKEN_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  res.cookies.set(LOGGED_IN_COOKIE, "", { ...cookieOptions(0), httpOnly: false, maxAge: 0 });
}

/**
 * 置位「必须改密」标记 cookie（登录时按 DB 的 `mustChangePassword` 决定）。
 * 生命周期跟随 refresh token（用户可能挂机很久才回来改密）。
 */
export function setPasswordChangeRequiredCookie(res: NextResponse): void {
  res.cookies.set(PASSWORD_CHANGE_REQUIRED_COOKIE, "1", cookieOptions(env.REFRESH_TOKEN_TTL));
}

/** 改密成功后清除标记（不清则用户会一直被中间件钉在改密页） */
export function clearPasswordChangeRequiredCookie(res: NextResponse): void {
  res.cookies.set(PASSWORD_CHANGE_REQUIRED_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}

export function toSessionUser(
  user: Pick<
    User,
    "id" | "email" | "name" | "role" | "status" | "emailVerified" | "mustChangePassword"
  >,
): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as SessionUser["role"],
    status: user.status as SessionUser["status"],
    emailVerified: user.emailVerified,
    mustChangePassword: user.mustChangePassword,
  };
}

/** 读取当前会话用户(校验 JWT + 数据库状态，禁用用户即时失效) */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerified: true,
      mustChangePassword: true,
    },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return toSessionUser(user);
}

/**
 * 必须登录。
 *
 * ⚠️ 强制改密门控（B-2）：`mustChangePassword === true` 时，除「改密 / 登出 /
 * 读自己」之外的一切接口都必须拒绝 —— 临时密码是一次性的引导凭证，不先改密
 * 就等于长期持有弱凭证。需要的接口请用下面两个显式例外函数，
 * **不要**在调用点绕过这个门控。
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  if (user.mustChangePassword) throw passwordChangeRequired();
  return user;
}

/**
 * 强制改密期间的**例外**入口：拿到会话但不拦截 `mustChangePassword`。
 * 仅限三类接口使用：
 *   - `PUT /api/user/password`（用户完成改密的唯一出口）
 *   - `POST /api/auth/logout`（用户必须能离开）
 *   - `GET  /api/auth/me` —— 它直接用 getSessionUser，本函数无需参与
 */
export async function requireUserAllowingPendingPasswordChange(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

/** 必须为 ADMIN 或 SUPPORT(管理后台) */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "SUPPORT") throw forbidden();
  return user;
}

/** 必须为 ADMIN(敏感操作) */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw forbidden();
  return user;
}

/** 登录成功后签发会话：生成 refresh token 记录 + 双 token */
export async function issueSession(user: Pick<User, "id" | "email" | "name" | "role">) {
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  });
  const refreshToken = await signRefreshToken(user.id);
  const record = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: await sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000),
    },
  });
  return { accessToken, refreshToken, refreshTokenId: record.id };
}

export interface RotatedTokens {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

/**
 * refresh token 单次消费 + 重放检测。
 *
 * 同进程的并发请求通过 single-flight 共用同一轮轮换；跨实例则由数据库条件更新
 * 原子 claim。已使用 token 再次出现时只拒绝并吊销会话，绝不据旧 token 签发新会话。
 */
const refreshRotations = new Map<string, Promise<RotatedTokens>>();

export async function rotateSession(refreshToken: string): Promise<RotatedTokens> {
  const tokenHash = await sha256(refreshToken);
  const existing = refreshRotations.get(tokenHash);
  if (existing) return existing;

  const pending = rotateSessionOnce(refreshToken, tokenHash).finally(() => {
    if (refreshRotations.get(tokenHash) === pending) refreshRotations.delete(tokenHash);
  });
  refreshRotations.set(tokenHash, pending);
  return pending;
}

class RefreshRotationRaceError extends Error {}

async function rotateSessionOnce(refreshToken: string, tokenHash: string): Promise<RotatedTokens> {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload?.sub) throw unauthorized("Your session has expired, please sign in again");

  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  // 已使用 token 再次出现一律视为重放。这里绝不根据旧 token 再签发新 token：
  // 那会把短暂并发直接变成窃取者可用的续期入口。
  if (record && (record.revokedAt || record.replacedBy)) {
    await revokeAllUserTokens(record.userId);
    logger.warn({ userId: record.userId }, "refresh token 重放，已吊销该用户全部会话");
    throw replayDetected();
  }

  if (!record || record.expiresAt < new Date()) {
    throw unauthorized("Your session has expired, please sign in again");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerified: true,
      mustChangePassword: true,
    },
  });
  if (!user || user.status !== "ACTIVE") throw unauthorized("This account has been disabled");

  const newRefreshToken = await signRefreshToken(user.id);
  const newRefreshHash = await sha256(newRefreshToken);

  // 跨实例并发：只有能把 revokedAt:null 原子更新为已消费的那个请求可以成功。
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null, replacedBy: null },
        data: { revokedAt: new Date(), replacedBy: newRefreshHash },
      });
      if (claimed.count !== 1) throw new RefreshRotationRaceError();
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newRefreshHash,
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000),
        },
      });
    });
  } catch (err) {
    if (!(err instanceof RefreshRotationRaceError)) throw err;
    await revokeAllUserTokens(record.userId);
    logger.warn({ userId: record.userId }, "refresh token 跨实例并发消费，已拒绝重放");
    throw replayDetected();
  }

  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    purpose: "access",
  });
  return { accessToken, refreshToken: newRefreshToken, user: toSessionUser(user) };
}

/** 吊销用户全部 refresh token(登出/重放/改密) */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
