import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { DIST_REF_COOKIE } from "@/lib/distribution/contract";

/**
 * 推广标识（referral）的生成与签名。
 *
 * 威胁模型：推广标识决定「这笔订单的佣金归谁」，因此不能是明文可猜的数字 id ——
 * 任何人手改成别人的 id 就能把佣金截走，还会污染关系链。故：
 *   1. 对外只暴露**随机推广码**（不是用户 id），泄露也无法反推账号；
 *   2. cookie 值 = `code.issuedAtMs.hmac`，用服务端密钥签名，改一个字节即失效。
 *
 * 本文件**只在服务端使用**（`proxy.ts` 与分销 service）：它会读 `JWT_ACCESS_SECRET`，
 * 且刻意不标 `server-only` —— 中间件/代理层需要静态引入它来做 cookie 签名，
 * 标了会让打包器把它误判为只能在 RSC 环境加载。客户端组件禁止引用。
 *
 * 签名密钥从既有 `JWT_ACCESS_SECRET` 派生（HMAC 派生子密钥），
 * 不新增必填环境变量 —— 生产密钥轮换时推广 cookie 一并失效（可接受的代价，
 * 用户重新点一次链接即可）。
 */

/** 推广码字符表：剔除 0/O/1/I/l 等易混淆字符，便于口头/手抄传播 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 推广码长度：8 位 ≈ 40bit，配合唯一约束足够；短码便于分享 */
export const REFERRAL_CODE_LENGTH = 8;

/** 生成随机推广码（CSPRNG + 拒绝采样，无取模偏置） */
export function generateReferralCode(length: number = REFERRAL_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET.charAt(randomInt(0, CODE_ALPHABET.length));
  }
  return out;
}

/** 规范化用户输入的推广码/参数：大写、去空白、只保留字符表内字符 */
export function normalizeReferralInput(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 4 || cleaned.length > 32) return null;
  return cleaned;
}

function refSecret(): string {
  const base = process.env.JWT_ACCESS_SECRET || "distribution-ref-dev-secret";
  return createHmac("sha256", base).update("distribution-ref-v1").digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", refSecret()).update(payload).digest("base64url");
}

/** 生成签名 cookie 值：`code.issuedAtMs.signature` */
export function signRefCookie(code: string, issuedAtMs: number = Date.now()): string {
  const payload = `${code}.${issuedAtMs}`;
  return `${payload}.${sign(payload)}`;
}

/** 校验签名 cookie，返回其中的推广码；过期/被篡改返回 null */
export function verifyRefCookie(
  value: string | null | undefined,
  maxAgeMs: number,
): { code: string; issuedAtMs: number } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [code, issuedAtRaw, signature] = parts as [string, string, string];
  const normalized = normalizeReferralInput(code);
  if (!normalized) return null;
  const issuedAtMs = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) return null;
  if (maxAgeMs > 0 && Date.now() - issuedAtMs > maxAgeMs) return null;

  const expected = sign(`${code}.${issuedAtRaw}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return { code: normalized, issuedAtMs };
}

/** 从 URL 查询参数里解析推广码（兼容 ref / distributor_id / invite 三种形态） */
export function refCodeFromSearchParams(entries: Iterable<[string, string]>): string | null {
  for (const [key, value] of entries) {
    if (key === "ref" || key === "distributor_id" || key === "invite") {
      const code = normalizeReferralInput(value);
      if (code) return code;
    }
  }
  return null;
}

export { DIST_REF_COOKIE };
