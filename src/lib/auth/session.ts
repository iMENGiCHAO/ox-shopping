import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Role, User } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/utils";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "@/lib/auth/jwt";
import { ApiError, forbidden, unauthorized } from "@/lib/errors";
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

/** 为响应设置双 token Cookie */
export function setAuthCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, cookieOptions(env.ACCESS_TOKEN_TTL));
  res.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, cookieOptions(env.REFRESH_TOKEN_TTL));
}

export function clearAuthCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_TOKEN_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  res.cookies.set(REFRESH_TOKEN_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
}

export function toSessionUser(
  user: Pick<User, "id" | "email" | "name" | "role" | "status" | "emailVerified">,
): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as SessionUser["role"],
    status: user.status as SessionUser["status"],
    emailVerified: user.emailVerified,
  };
}

/** 读取当前会话用户(校验 JWT + 数据库状态，禁用用户即时失效) */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, status: true, emailVerified: true },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return toSessionUser(user);
}

/** 必须登录 */
export async function requireUser(): Promise<SessionUser> {
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
 * refresh token 轮换(含重放检测)：
 * - 合法未用 token：作废旧记录、签发新记录与新 token 对
 * - 已使用/已吊销 token 再次出现 → 判定泄露，吊销该用户全部会话
 */
export async function rotateSession(refreshToken: string): Promise<RotatedTokens> {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload?.sub) throw unauthorized("登录已过期，请重新登录");

  const tokenHash = await sha256(refreshToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  // 重放检测：token 已被轮换/吊销却再次出现
  if (record && (record.revokedAt || record.replacedBy)) {
    await revokeAllUserTokens(record.userId);
    logger.warn({ userId: record.userId }, "refresh token 重放，已吊销该用户全部会话");
    throw unauthorized("检测到异常登录，请重新登录");
  }

  if (!record || record.expiresAt < new Date()) {
    throw unauthorized("登录已过期，请重新登录");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, status: true, emailVerified: true },
  });
  if (!user || user.status !== "ACTIVE") throw unauthorized("账号已被禁用");

  const newTokens = await issueSession(user);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedBy: newTokens.refreshTokenId },
    }),
  ]);

  return { ...newTokens, user: toSessionUser(user) };
}

/** 吊销用户全部 refresh token(登出/重放/改密) */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** 清理过期 refresh token 记录(定期任务可调用) */
export async function cleanupExpiredTokens(): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}

/** 便捷：构造需要登录的错误(供刷新失败重定向) */
export function refreshRequiredError(): ApiError {
  return unauthorized("登录已过期，请重新登录");
}
