import "server-only";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
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
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return { ok: false, error: "文件为空" };
  if (file.size > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: `文件超过大小限制(最大 ${Math.floor(UPLOAD_MAX_BYTES / 1024 / 1024)}MB)`,
    };
  }
  return { ok: true };
}

const IMAGE_FORMAT_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/**
 * 校验实际字节内容，而不仅信客户端 MIME。sharp 会读取 magic/容器并尝试解码；
 * 解码成功且格式与声明 MIME 一致才接受，避免把 HTML/SVG/伪造扩展名写入公开桶。
 */
export async function validateImageBuffer(
  buffer: Buffer,
  mime: string,
  size = buffer.byteLength,
): Promise<UploadValidation> {
  const basic = validateUpload({ type: mime, size });
  if (!basic.ok) return basic;
  try {
    const image = sharp(buffer, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!metadata.format || IMAGE_FORMAT_MIME[metadata.format] !== mime) {
      return { ok: false, error: "文件内容不是所声明的图片格式" };
    }
    // metadata 只验证容器头；stats 会实际解码像素，拒绝截断/损坏图片。
    await image.stats();
    return { ok: true };
  } catch {
    return { ok: false, error: "文件内容不是可解析的图片" };
  }
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
  size: number,
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
    ContentLength: size,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { url, key };
}

function isManagedUploadKey(key: string): boolean {
  return /^uploads\/(?:categories|products|brand|misc)\/\d{4}\/\d{2}\/[A-Za-z0-9-]+\.(?:jpe?g|png|webp|gif|avif)$/.test(
    key,
  );
}

/**
 * S3 直传完成闸门。客户端 PUT 成功后必须调用：服务端重新读取对象元数据和全部
 * 字节，核对声明大小/MIME，并用图片解码器验证 magic；非法对象立即删除。
 */
export async function completePresignedUpload(
  key: string,
  expectedMime: string,
  expectedSize: number,
): Promise<{ ok: boolean; error?: string; url?: string }> {
  if (effectiveStorageDriver !== "s3") return { ok: false, error: "S3 未启用" };
  if (!isManagedUploadKey(key)) return { ok: false, error: "非法存储对象 key" };
  const declared = validateUpload({ type: expectedMime, size: expectedSize });
  if (!declared.ok) return declared;

  const s3 = getS3();
  if (!s3) return { ok: false, error: "S3 未配置" };

  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    if (!head) throw new Error("上传对象元数据为空");
    const actualMime = ((head.ContentType ?? "").split(";", 1)[0] ?? "").trim().toLowerCase();
    if ((head.ContentLength ?? -1) !== expectedSize) {
      throw new Error("上传大小与声明不一致");
    }
    if (actualMime !== expectedMime) {
      throw new Error("上传类型与声明不一致");
    }

    const object = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    if (!object.Body) throw new Error("上传对象为空");
    const bytes = await object.Body.transformToByteArray();
    const content = await validateImageBuffer(Buffer.from(bytes), expectedMime, bytes.byteLength);
    if (!content.ok) throw new Error(content.error ?? "上传内容不合法");
    return { ok: true, url: publicUrlFor(key) };
  } catch (err) {
    // 校验失败或对象不可读时不把半成品留在公开桶里。
    await s3
      .send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
      .catch(() => undefined);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "上传验证失败",
    };
  }
}

/** 服务端保存文件(本地模式直传使用)，返回公开 URL */
export async function saveUpload(
  buffer: Buffer,
  originalName: string,
  mime: string,
  purpose: UploadPurpose = "misc",
): Promise<{ url: string; key: string }> {
  const content = await validateImageBuffer(buffer, mime);
  if (!content.ok) throw new Error(content.error ?? "文件内容不合法");
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
