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
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
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
 *
 * 关键不变量：必须保证"创建新 record"与"作废旧 record"原子性。
 * 旧实现里 issueSession 提前独立 commit，新 record 已入库；后续旧 record
 * 标 replacedBy 失败时链断裂，下一次轮换会把合法新 token 当作重放误吊销。
 * 此版本把两步放进同一 $transaction，并先在事务内预生成新 token 字符串。
 */
export async function rotateSession(refreshToken: string): Promise<RotatedTokens> {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload?.sub) throw unauthorized("登录已过期，请重新登录");

  const tokenHash = await sha256(refreshToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  // 重放检测：token 已被轮换/吊销却再次出现。
  // 关键：区分「真·窃取重放」与「善意重试」。轮换过程是"先写新 record、再标旧 record
  // replacedBy（同一事务）"；若客户端在事务提交后、尚未收到响应前断网（移动端弱网极常见），
  // 浏览器仍持有旧 token 并重发它。此时旧 record 的 replacedBy 指向的后继 token 仍处于
  // 「未使用」状态（未被再次轮换、未吊销、未过期）= 链未闭合，说明原客户端根本没拿到
  // 新 token、只是本人重试 → 不应吊销全部会话，只需重建当前会话。
  if (record && (record.revokedAt || record.replacedBy)) {
    const benignRetry = record.replacedBy ? await isChainUnclosed(record.replacedBy) : false;

    if (benignRetry) {
      // 善意重试：吊销卡住的后继 token 并重建一条新会话，不殃及其它设备。
      const retryUser = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true, role: true, status: true, emailVerified: true },
      });
      if (!retryUser || retryUser.status !== "ACTIVE") throw unauthorized("账号已被禁用");

      await prisma.refreshToken.updateMany({
        where: { tokenHash: record.replacedBy!, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const retried = await issueSession(retryUser);
      logger.warn({ userId: record.userId }, "refresh token 善意重试（响应丢失后重发），重建会话而非吊销全部");
      return {
        accessToken: retried.accessToken,
        refreshToken: retried.refreshToken,
        user: toSessionUser(retryUser),
      };
    }

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

  // 1) 预生成新 token 字符串（事务外，JWT 签名无副作用）
  const newRefreshToken = await signRefreshToken(user.id);
  const newRefreshHash = await sha256(newRefreshToken);

  // 2) 事务：写新 record + 旧 record 标 replacedBy + revokedAt。任一失败全回滚。
  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: newRefreshHash,
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000),
      },
    }),
    prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedBy: newRefreshHash },
    }),
  ]);

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

/**
 * 判定「链未闭合」：被轮换的旧 token 的 replacedBy 后继，是否仍处于未使用状态。
 * - 后继存在、未被吊销、未被再次轮换、且未过期 → 原客户端从未成功收下后继 token
 *   （响应丢失后重发旧 token 属善意重试），返回 true；
 * - 后继已被再次轮换/吊销/过期/不存在（链已闭合）→ 旧 token 的再次出现是窃取重放，
 *   返回 false。
 */
async function isChainUnclosed(replacedByHash: string): Promise<boolean> {
  const successor = await prisma.refreshToken.findUnique({
    where: { tokenHash: replacedByHash },
    select: { revokedAt: true, replacedBy: true, expiresAt: true },
  });
  if (!successor) return false;
  if (successor.revokedAt) return false;
  if (successor.replacedBy) return false;
  if (successor.expiresAt < new Date()) return false;
  return true;
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
