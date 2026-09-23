import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { completePresignedUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const runtime = "nodejs";

const completeBodySchema = z.object({
  key: z.string().trim().min(1).max(300),
  mime: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
});

/**
 * POST /api/admin/uploads/complete — S3 直传完成闸门。
 * PUT 成功不代表内容可信；这里重新读取对象并校验大小、MIME 与图片 magic，
 * 校验失败会删除对象，客户端不得在 complete 成功前使用 publicUrl。
 */
export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  const input = await readJson(req, completeBodySchema);
  const result = await completePresignedUpload(input.key, input.mime, input.size);
  if (!result.ok) throw badRequest(result.error ?? "上传验证失败");
  await audit({
    userId: actor.id,
    action: "UPLOAD",
    entity: "Upload",
    entityId: input.key,
    meta: { size: input.size, mime: input.mime, storage: "s3", validated: true },
    req,
  });
  return json({ ok: true, key: input.key, publicUrl: result.url });
});
