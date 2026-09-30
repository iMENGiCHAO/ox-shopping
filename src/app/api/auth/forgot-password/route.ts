import { apiHandler, json, readJson } from "@/lib/api";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { getClientIp } from "@/lib/server/utils-server";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { createPasswordResetRequest } from "@/server/services/password-reset.service";

export const runtime = "nodejs";

/**
 * POST /api/auth/forgot-password — 提交找回密码申请（B-2 原站式人工审批流）
 *
 * 闭环：用户填邮箱 → 落库 PENDING + 通知管理员 → 管理员批准后邮件下发强随机
 * 临时密码 → 用户首登强制改密。批准入口见
 * `POST /api/admin/password-resets/[id]`。
 *
 * 防枚举（**不要改**）：无论邮箱是否存在、账号是否停用、是否已有在途申请，
 * 一律返回同一句回执。任何区分口径（"该邮箱未注册"）都会变成邮箱枚举接口。
 *
 * 限流双保险：单 IP 3 次/分钟；同一邮箱 3 次/小时（防有人拿他人邮箱刷后台待办）。
 */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, forgotPasswordSchema);

  // 单标识 3 次/分钟 + 全站熔断 200 次/小时（防标识轮换刷邮件配额）
  const rl = await rateLimit({
    key: `forgot:${getClientIp(req)}`,
    ...RATE_LIMITS.forgotPassword,
  });
  if (!rl.ok) throw rateLimited();
  const rlEmail = await rateLimit({
    key: `forgot-email:${input.email.toLowerCase()}`,
    ...RATE_LIMITS.forgotPasswordEmail,
  });
  if (!rlEmail.ok) throw rateLimited("Too many requests, please try again later");

  // 刻意丢弃返回值 created：它恰好就是「邮箱是否注册」的答案，回给前台即枚举漏洞
  await createPasswordResetRequest({
    email: input.email,
    ...(input.note ? { note: input.note } : {}),
    ip: getClientIp(req),
    req,
  });

  // 防枚举回执（成功载荷不走 apiHandler 的错误本地化出口）：**英文源串**是
  // 默认语言文案；中文界面由前端 t() 渲染对应文案。此前硬编码中文，
  // 英文用户提交找回密码后看到中文回执（i18n 泄漏）。
  return json({
    ok: true,
    message:
      "If this email is registered, your password reset request has been submitted — please wait for admin approval and check your inbox for the temporary password",
  });
});
