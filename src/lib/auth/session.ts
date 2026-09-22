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
  ApiError,
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
 * refresh token 复用宽限期。
 *
 * 为什么必须有：`proxy.ts` 在 access token 失效时会对**每一个**请求调用
 * `rotateSession`，而一个页面（尤其后台看板）会同时发出多个 API 请求，
 * 它们带着**同一个** refresh token 并发到达：
 *
 *   请求 A：R1 → R2（事务内写 R2、标 R1.revokedAt=now / replacedBy=R2）
 *   请求 B：R1 已被轮换 → 链未闭合 → 善意重试 → 吊销 R2、签发 R3
 *   请求 C：R1 已被轮换，而 R2 已被 B 吊销 ⇒ 链已闭合 ⇒ **判定重放、吊销该用户全部会话**
 *
 * 即：只要并发 ≥3，正常用户就会被踢下线。实测证据：同一 userId 在 12 秒内
 * 触发 12 次「refresh token 重放」，后台看板随即 401。
 *
 * 修法：旧 token 在**刚被轮换后的宽限期内**再次出现，一律按「同一客户端的
 * 并发请求 / 响应丢失后的重试」处理，不再升级为窃取重放。
 *
 * 安全性权衡：真正的令牌窃取重放发生在被盗之后（远超数十秒），仍会命中
 * 「链已闭合 **且** 超出宽限期」分支而被吊销全部会话。宽限期内的复用风险
 * 与业界通行的 refresh-token grace period 一致，是安全与可用性的标准折中。
 */
const ROTATION_REUSE_GRACE_MS = 60_000;

/**
 * refresh token 轮换(含重放检测)：
 * - 合法未用 token：作废旧记录、签发新记录与新 token 对
 * - 已使用/已吊销 token 再次出现 → 见下方「善意复用 / 真·重放」判定
 *
 * 关键不变量：必须保证"创建新 record"与"作废旧 record"原子性。
 * 旧实现里 issueSession 提前独立 commit，新 record 已入库；后续旧 record
 * 标 replacedBy 失败时链断裂，下一次轮换会把合法新 token 当作重放误吊销。
 * 此版本把两步放进同一 $transaction，并先在事务内预生成新 token 字符串。
 */
export async function rotateSession(refreshToken: string): Promise<RotatedTokens> {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload?.sub) throw unauthorized("Your session has expired, please sign in again");

  const tokenHash = await sha256(refreshToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  // 重放检测：token 已被轮换/吊销却再次出现。
  // 需区分「善意复用」与「真·窃取重放」，两种善意场景：
  //   (a) 链未闭合：客户端在事务提交后、尚未收到响应前断网（移动端弱网常见），
  //       仍持有旧 token 并重发 —— 其后继 token 仍处「未使用」状态，
  //       说明原客户端根本没拿到新 token。
  //   (b) 宽限期内：同一页面并发发出的多个请求携带同一个旧 token，
  //       只有第一个能成功轮换，其余都在宽限期内到达（见 ROTATION_REUSE_GRACE_MS）。
  if (record && (record.revokedAt || record.replacedBy)) {
    const chainUnclosed = record.replacedBy ? await isChainUnclosed(record.replacedBy) : false;
    const withinGrace =
      !!record.revokedAt && Date.now() - record.revokedAt.getTime() <= ROTATION_REUSE_GRACE_MS;
    const benignReuse = chainUnclosed || withinGrace;

    if (benignReuse) {
      // 善意复用：重建一条新会话，不殃及其它设备。
      const retryUser = await prisma.user.findUnique({
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
      if (!retryUser || retryUser.status !== "ACTIVE") {
        throw unauthorized("This account has been disabled");
      }

      // 只在「链未闭合」时回收那个后继 token —— 此时可确认原客户端从未收到它。
      // 若只是宽限期内的并发复用（链已闭合），后继很可能已经被别的并发响应
      // 写进了客户端 Cookie，回收它反而会让下一次请求拿着「已吊销且无后继」
      // 的 token 直接命中重放分支 —— 又把人踢下线。
      if (chainUnclosed && record.replacedBy) {
        await prisma.refreshToken.updateMany({
          where: { tokenHash: record.replacedBy, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      const retried = await issueSession(retryUser);
      logger.warn(
        { userId: record.userId, chainUnclosed, withinGrace },
        "refresh token 复用（并发/重试），重建会话而非吊销全部",
      );
      return {
        accessToken: retried.accessToken,
        refreshToken: retried.refreshToken,
        user: toSessionUser(retryUser),
      };
    }

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
  return unauthorized("Your session has expired, please sign in again");
}
