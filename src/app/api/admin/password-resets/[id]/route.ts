import { apiHandler, json, readJson } from "@/lib/api";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import {
  approvePasswordResetRequest,
  rejectPasswordResetRequest,
} from "@/server/services/password-reset.service";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  /** 驳回原因（发给用户的说明，可选） */
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/admin/password-resets/[id] — 处理找回密码申请（B-2）
 *
 * approve = 批准：服务端生成强随机临时密码 → bcrypt 入库 → 账号置
 *   `mustChangePassword` → 邮件下发明文临时密码 → 吊销该用户全部旧会话。
 *   响应里的 `tempPassword` 是**一次性明文兜底**：邮件服务未配置（console 模式）
 *   或投递失败时，管理员可当面/电话转达。DB 中不存在明文，刷新后无法再取。
 *
 * reject = 驳回：状态置 REJECTED，原因随邮件告知用户，账号密码不受影响。
 */
export const POST = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, schema);

  if (input.action === "approve") {
    const result = await approvePasswordResetRequest({ id, actorId: actor.id, req });
    return json({
      ok: true,
      action: "approve" as const,
      email: result.email,
      name: result.name,
      // 一次性明文：仅本次响应返回，供管理员在邮件不可达时转达
      tempPassword: result.tempPassword,
      mailConfigured: result.mailConfigured,
    });
  }

  const result = await rejectPasswordResetRequest({
    id,
    actorId: actor.id,
    ...(input.note ? { note: input.note } : {}),
    req,
  });
  return json({ ok: true, action: "reject" as const, email: result.email });
});
