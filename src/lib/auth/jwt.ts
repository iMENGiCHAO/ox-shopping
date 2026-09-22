import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/lib/env";
import { EMAIL_TOKEN_TTL } from "@/lib/constants";
import { randomToken } from "@/lib/utils";

/**
 * JWT 签发/校验(jose，HS256)。
 * 注意：本模块被 Edge 中间件引用，不能 import "server-only"。
 * - access token：用户会话(15 分钟)
 * - refresh token：轮换续期(7 天)
 * - email token：邮箱验证(含用途声明，防跨用途复用)
 */

const encoder = new TextEncoder();

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: "ADMIN" | "CUSTOMER" | "SUPPORT";
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  type: "refresh";
}

/**
 * 邮箱令牌用途。当前唯一用途是邮箱验证（注册 / 重发验证 / 换邮箱）。
 * 令牌自带用途声明并在校验时核对，防止跨用途复用；历史上的
 * "reset-password" 用途已随 token 自助重置死链路一并移除
 * （找回密码走 B-2 人工审批 + 临时密码流，见 password-reset.service）。
 */
export type EmailTokenPurpose = "verify-email";

export interface EmailTokenPayload extends JWTPayload {
  sub: string;
  email: string;
  purpose: EmailTokenPurpose;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL}s`)
    .sign(encoder.encode(env.JWT_ACCESS_SECRET));
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.JWT_ACCESS_SECRET));
    return payload as unknown as AccessTokenPayload;
  } catch {
    return null;
  }
}

export async function signRefreshToken(userId: string): Promise<string> {
  return (
    new SignJWT({ type: "refresh" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      // 随机 jti：同一秒内多次签发时保证 token 唯一(tokenHash 有唯一约束)
      .setJti(randomToken(8))
      .setIssuedAt()
      .setExpirationTime(`${env.REFRESH_TOKEN_TTL}s`)
      .sign(encoder.encode(env.JWT_REFRESH_SECRET))
  );
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.JWT_REFRESH_SECRET));
    if (payload.type !== "refresh") return null;
    return payload as unknown as RefreshTokenPayload;
  } catch {
    return null;
  }
}

export async function signEmailToken(
  payload: Omit<EmailTokenPayload, "iat" | "exp">,
  purpose: EmailTokenPurpose,
): Promise<string> {
  // 签发侧对称断言（verifyEmailToken 的镜像）：purpose 声明必须与载荷内的
  // purpose 一致 —— 该类 token 在 verify 侧必然被拒，不如签发时就 fail-fast。
  if (payload.purpose !== purpose) {
    throw new Error("signEmailToken: purpose declaration mismatch");
  }
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${EMAIL_TOKEN_TTL}s`)
    .sign(encoder.encode(env.JWT_ACCESS_SECRET));
}

export async function verifyEmailToken(
  token: string,
  purpose: EmailTokenPurpose,
): Promise<EmailTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.JWT_ACCESS_SECRET));
    const p = payload as unknown as EmailTokenPayload;
    if (p.purpose !== purpose) return null;
    return p;
  } catch {
    return null;
  }
}
