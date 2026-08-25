import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { getPresignedUpload, validateUpload } from "@/lib/storage";
import { env } from "@/lib/env";
import { z } from "zod";

export const runtime = "nodejs";

const presignBodySchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mime: z.string().trim().min(1).max(100),
});

/** POST /api/admin/uploads/presign — S3 预签名上传 */
export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  const input = await readJson(req, presignBodySchema);

  // size 传 1 仅做 MIME 白名单校验(预签名阶段不知道文件大小)
  const validation = validateUpload({ type: input.mime, size: 1 });
  if (!validation.ok) throw badRequest(validation.error ?? "文件类型不合法");

  const result = await getPresignedUpload(input.filename, input.mime);
  if (!result) throw badRequest("预签名上传未配置(S3 未启用)");

  return json({
    url: result.url,
    key: result.key,
    publicUrl: `${env.S3_PUBLIC_URL}/${result.key}`,
  });
});
