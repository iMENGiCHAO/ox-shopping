import "server-only";
import sharp from "sharp";
import { readLocalUpload } from "@/lib/storage";
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

async function loadLogoBuffer(url: string): Promise<Buffer | null> {
  // 本地上传文件（local 存储驱动的公开 URL 形态）
  if (url.startsWith(LOCAL_PREFIX)) {
    const rest = url.slice(LOCAL_PREFIX.length);
    const got = await readLocalUpload(rest);
    return got?.buffer ?? null;
  }
  // S3/公网 URL：限定 http(s) + 必须是图片类型，带超时
  if (/^https:\/\//.test(url)) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.startsWith("image/")) return null;
      return Buffer.from(await res.arrayBuffer());
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
    logger.warn({ err, url }, "[logo-contrast] LOGO 明度测定失败，按不反白处理");
    return null;
  }
}
