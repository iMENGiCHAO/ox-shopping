import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { env, effectiveStorageDriver } from "@/lib/env";
import { randomFilename } from "@/lib/utils";
import { ALLOWED_IMAGE_MIME, UPLOAD_MAX_BYTES } from "@/lib/constants";
import { logger } from "@/lib/logger";

/**
 * 文件存储：S3 兼容对象存储(AWS S3 / Cloudflare R2 / MinIO)或本地磁盘(开发降级)。
 * 安全要求：类型白名单、大小限制、随机文件名、预签名上传。
 */

let s3Client: S3Client | null = null;

function getS3(): S3Client | null {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null;
  if (!s3Client) {
    s3Client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

export interface UploadValidation {
  ok: boolean;
  error?: string;
}

/** 上传文件校验：MIME 白名单 + 大小限制 */
export function validateUpload(file: { type: string; size: number }): UploadValidation {
  if (!ALLOWED_IMAGE_MIME.includes(file.type as (typeof ALLOWED_IMAGE_MIME)[number])) {
    return {
      ok: false,
      error: `不支持的文件类型：${file.type || "未知"}(仅支持 jpg/png/webp/gif/avif)`,
    };
  }
  if (file.size <= 0) return { ok: false, error: "文件为空" };
  if (file.size > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: `文件超过大小限制(最大 ${Math.floor(UPLOAD_MAX_BYTES / 1024 / 1024)}MB)`,
    };
  }
  return { ok: true };
}

/**
 * 上传用途 → 存储子目录（大爷 2026-09-20：图片要按用途有序归档，
 * 不要所有图混在同一个位置）。落盘形如 `uploads/categories/2026/09/xxx.jpg`，
 * S3 模式的 Key 同规则，本地/云两侧目录结构一致。
 */
export const UPLOAD_PURPOSES = ["categories", "products", "brand", "misc"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

/** 把外部传入的 purpose 收敛到白名单（未知值一律归 misc，避免路径注入/目录爆炸） */
export function normalizeUploadPurpose(value: unknown): UploadPurpose {
  return typeof value === "string" && (UPLOAD_PURPOSES as readonly string[]).includes(value)
    ? (value as UploadPurpose)
    : "misc";
}

function objectKey(originalName: string, purpose: UploadPurpose = "misc"): string {
  const d = new Date();
  const ym = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `uploads/${purpose}/${ym}/${randomFilename(originalName)}`;
}

function publicUrlFor(key: string): string {
  if (effectiveStorageDriver === "s3") {
    const base = env.S3_PUBLIC_URL || env.S3_ENDPOINT;
    return `${base.replace(/\/$/, "")}/${key}`;
  }
  return `/api/uploads/${key}`;
}

function localPathFor(key: string): string {
  const root = path.join(process.cwd(), "storage");
  const target = path.resolve(root, key);
  // 路径穿越防护：解析后的目标必须仍在 storage 根内(前缀 + 分隔符双重校验)
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("非法存储路径");
  }
  return target;
}

/** 获取预签名 PUT 上传地址(S3 模式；本地模式返回 null，走 /api/admin/uploads 直传) */
export async function getPresignedUpload(
  originalName: string,
  mime: string,
  purpose: UploadPurpose = "misc",
): Promise<{ url: string; key: string } | null> {
  if (effectiveStorageDriver !== "s3") return null;
  const s3 = getS3();
  if (!s3) return null;
  const key = objectKey(originalName, purpose);
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: mime,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { url, key };
}

/** 服务端保存文件(本地模式直传使用)，返回公开 URL */
export async function saveUpload(
  buffer: Buffer,
  originalName: string,
  mime: string,
  purpose: UploadPurpose = "misc",
): Promise<{ url: string; key: string }> {
  const key = objectKey(originalName, purpose);

  if (effectiveStorageDriver === "s3") {
    const s3 = getS3();
    if (!s3) throw new Error("S3 未配置");
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mime,
      }),
    );
  } else {
    const filePath = localPathFor(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    logger.info({ filePath }, "本地文件已保存");
  }

  return { url: publicUrlFor(key), key };
}

/** 删除文件(尽力而为) */
export async function deleteUpload(key: string): Promise<void> {
  try {
    if (effectiveStorageDriver === "s3") {
      const s3 = getS3();
      if (!s3) return;
      await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    } else {
      await unlink(localPathFor(key)).catch(() => undefined);
    }
  } catch (err) {
    logger.warn({ err, key }, "删除文件失败");
  }
}

/** 本地模式：读取文件内容(供 /api/uploads 路由) */
export async function readLocalUpload(
  restPath: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  const { readFile } = await import("node:fs/promises");
  try {
    const buffer = await readFile(localPathFor(restPath));
    const ext = path.extname(restPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".avif": "image/avif",
    };
    return { buffer, mime: mimeMap[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export { effectiveStorageDriver };
