import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, rateLimited } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { getPresignedUpload, normalizeUploadPurpose, validateUpload } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { z } from "zod";

export const runtime = "nodejs";

const presignBodySchema = z.object({
  filename: z.string().trim().min(1).max(255),
  /** 用途：决定存储子目录（categories/products/brand/misc） */
  purpose: z.string().trim().max(32).optional(),
  mime: z.string().trim().min(1).max(100),
  /** 浏览器 File.size，S3 Content-Length 会绑定此值，完成时再核对实际对象大小。 */
  size: z.number().int().positive(),
});

/** POST /api/admin/uploads/presign — S3 预签名上传 */
export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  // 存储限流（安全审计）：与本地直传同一策略（预签名也占用对象存储）
  const rl = await rateLimit({
    key: `admin-upload:${actor.id}`,
    ...RATE_LIMITS.adminUpload,
  });
  if (!rl.ok) throw rateLimited();
  const input = await readJson(req, presignBodySchema);

  // 预签名阶段只能校验客户端声明值；完成闸门会再次读取对象并校验真实字节。
  const validation = validateUpload({ type: input.mime, size: input.size });
  if (!validation.ok) throw badRequest(validation.error ?? "文件类型不合法");

  const result = await getPresignedUpload(
    input.filename,
    input.mime,
    input.size,
    normalizeUploadPurpose(input.purpose),
  );
  if (!result) throw badRequest("预签名上传未配置(S3 未启用)");

  return json({
    url: result.url,
    key: result.key,
  });
});
