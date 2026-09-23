import "server-only";
import sharp from "sharp";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { readLocalUpload } from "@/lib/storage";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * LOGO 明度测定（用于黑色顶栏的自动反白）。
 *
 * 背景：前台顶栏是纯黑色（bg-ink）。商家上传的透明背景 LOGO 若图案本身是黑色，
 * 会"黑图压黑底"完全看不见。这里在服务端测定图案（透明像素不计入）的平均亮度：
 * - 图案偏暗 → 返回 true → 顶栏渲染时加 invert 反白；
 * - 图案偏亮（白色/浅色图案）→ 保持原样；
 * - 测定失败（图片不存在/损坏/网络不可达）→ 返回 null → 视为不反白（保守原样）。
 *
 * 只读不写：本模块不改图片内容，只返回测定结果，原始文件保持商家上传原样。
 */

const LOCAL_PREFIX = "/api/uploads/";
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const REMOTE_LOGO_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split(".").map(Number);
    const a = parts[0] ?? -1;
    const b = parts[1] ?? -1;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mappedV4) return isPrivateAddress(mappedV4);
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  return true;
}

function safeOriginForLog(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

function configuredStorageOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * 仅允许公网 http(s) URL，或配置中明确声明的 S3 公网/内网端点。
 * 解析所有 DNS A/AAAA 结果并拒绝任一私网地址，避免 DNS rebinding/混合解析绕过。
 */
export async function isSafeLogoUrl(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password || (url.port && !["80", "443"].includes(url.port))) return false;
  const trustedOrigins = new Set(
    [env.S3_PUBLIC_URL, env.S3_ENDPOINT]
      .map(configuredStorageOrigin)
      .filter((v): v is string => !!v),
  );
  if (trustedOrigins.has(url.origin)) return true;
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local")
  ) {
    return false;
  }
  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
}

async function loadLogoBuffer(url: string): Promise<Buffer | null> {
  // 本地上传文件（local 存储驱动的公开 URL 形态）
  if (url.startsWith(LOCAL_PREFIX)) {
    const rest = url.slice(LOCAL_PREFIX.length);
    const got = await readLocalUpload(rest);
    if (!got || got.buffer.byteLength > MAX_LOGO_BYTES) return null;
    return got.buffer;
  }
  // 远程 URL：先做 SSRF 校验，再禁用自动重定向并限制实际响应体大小。
  if (/^https?:\/\//i.test(url)) {
    try {
      if (!(await isSafeLogoUrl(url))) return null;
      const res = await fetch(url, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok || res.status >= 300) return null;
      const headers = res.headers;
      if (!headers) return null;
      const contentLength = Number(headers.get("content-length") ?? 0);
      if (contentLength > MAX_LOGO_BYTES) return null;
      const ct = ((headers.get("content-type") ?? "").split(";", 1)[0] ?? "").trim().toLowerCase();
      if (!REMOTE_LOGO_MIME.has(ct)) {
        return null;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength > MAX_LOGO_BYTES) return null;
      return buffer;
    } catch {
      return null;
    }
  }
  return null;
}

/** 测定 LOGO 透明像素之外的图案是否偏暗（true=需要反白；null=无法测定） */
export async function isLogoArtworkDark(url: string): Promise<boolean | null> {
  try {
    const buffer = await loadLogoBuffer(url);
    if (!buffer) return null;
    // 等比缩到 ≤256px 足够判定明暗，同时把大图的逐像素循环成本固定下来
    const { data, info } = await sharp(buffer)
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels; // ensureAlpha 后恒为 4
    const pixels = data.length / channels;
    // 按 alpha 加权求图案亮度：完全透明的像素不计入
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < pixels; i++) {
      const a = data[i * channels + 3] ?? 0;
      if (a < 32) continue;
      const r = data[i * channels] ?? 0;
      const g = data[i * channels + 1] ?? 0;
      const b = data[i * channels + 2] ?? 0;
      // Rec.709 相对亮度
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      weightedSum += lum * a;
      weightTotal += a;
    }
    if (weightTotal === 0) return null; // 全透明图，无法判定
    return weightedSum / weightTotal < 128;
  } catch (err) {
    logger.warn(
      { err, logoOrigin: safeOriginForLog(url) },
      "[logo-contrast] LOGO 明度测定失败，按不反白处理",
    );
    return null;
  }
}
