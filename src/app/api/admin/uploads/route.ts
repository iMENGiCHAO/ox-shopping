import { apiHandler, json } from "@/lib/api";
import { badRequest, rateLimited } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import {
  effectiveStorageDriver,
  normalizeUploadPurpose,
  saveUpload,
  validateUpload,
} from "@/lib/storage";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { UPLOAD_MAX_BYTES } from "@/lib/constants";

export const runtime = "nodejs";

/** POST /api/admin/uploads — 本地直传 */
export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  // 存储限流（安全审计）：无成本上限的上传是存储/备份费用放大器
  const rl = await rateLimit({
    key: `admin-upload:${actor.id}`,
    ...RATE_LIMITS.adminUpload,
  });
  if (!rl.ok) throw rateLimited();
  if (effectiveStorageDriver !== "local") throw badRequest("请使用预签名上传接口");

  // multipart 解析本身会分配内存；先用 Content-Length 做廉价上限检查。
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > UPLOAD_MAX_BYTES + 1024 * 1024) {
    throw badRequest("文件超过大小限制");
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("请选择文件");

  const validation = validateUpload({ type: file.type, size: file.size });
  if (!validation.ok) throw badRequest(validation.error ?? "文件不合法");

  const buffer = Buffer.from(await file.arrayBuffer());
  // 用途决定归档子目录（categories/products/brand/misc），未知值归 misc
  const purpose = normalizeUploadPurpose(form.get("purpose"));
  const { url, key } = await saveUpload(buffer, file.name, file.type, purpose);

  await audit({
    userId: actor.id,
    action: "UPLOAD",
    entity: "Upload",
    entityId: key,
    meta: { url, size: file.size, purpose },
    req,
  });
  return json({ url, key });
});
