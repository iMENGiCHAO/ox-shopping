import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/lib/env";
import { EMAIL_TOKEN_TTL, RESET_TOKEN_TTL } from "@/lib/constants";
import { randomToken } from "@/lib/utils";

/**
 * JWT 签发/校验(jose，HS256)。
 * 注意：本模块被 Edge 中间件引用，不能 import "server-only"。
 * - access token：用户会话(15 分钟)
 * - refresh token：轮换续期(7 天)
 * - email token：邮箱验证 / 密码重置(含用途声明，防跨用途复用)
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

export type EmailTokenPurpose = "verify-email" | "reset-password";

export interface EmailTokenPayload extends JWTPayload {
  sub: string;
  email: string;
  purpose: EmailTokenPurpose;
  /** 密码指纹：密码修改后旧重置令牌自动失效 */
  fp?: string;
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
  const ttl = purpose === "verify-email" ? EMAIL_TOKEN_TTL : RESET_TOKEN_TTL;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
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
