import { apiHandler, json } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import {
  effectiveStorageDriver,
  normalizeUploadPurpose,
  saveUpload,
  validateUpload,
} from "@/lib/storage";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** POST /api/admin/uploads — 本地直传 */
export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  if (effectiveStorageDriver !== "local") throw badRequest("请使用预签名上传接口");

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
