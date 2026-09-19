import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * 支付渠道配置加密核心（AES-256-GCM）——无 server-only / 无 env 依赖的纯函数，
 * 供 channel-crypto.ts（服务端）与一次性迁移脚本共用，保证算法一致。
 *
 * - 密钥：传入 rawKey 字符串，内部 SHA-256 → 32 字节。
 * - IV：每次加密随机 12 字节。
 * - 密文格式：`v1.<base64url(iv)>.<base64url(ciphertext||authTag)>`。
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const VERSION = "v1";

function deriveKey(rawKey: string): Buffer {
  return createHash("sha256").update(rawKey).digest();
}

export function encryptConfig(
  rawKey: string,
  config: Record<string, unknown>,
): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, deriveKey(rawKey), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([encrypted, tag]);
  return [VERSION, iv.toString("base64url"), payload.toString("base64url")].join(".");
}

export function decryptConfig(rawKey: string, blob: string): Record<string, unknown> {
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new Error("渠道配置密文格式无效");
  }
  const iv = Buffer.from(parts[1]!, "base64url");
  const data = Buffer.from(parts[2]!, "base64url");
  if (iv.length !== IV_LEN || data.length <= AUTH_TAG_LEN) {
    throw new Error("渠道配置密文长度无效");
  }
  const encrypted = data.subarray(0, data.length - AUTH_TAG_LEN);
  const tag = data.subarray(data.length - AUTH_TAG_LEN);

  const decipher = createDecipheriv(ALGO, deriveKey(rawKey), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as Record<string, unknown>;
}