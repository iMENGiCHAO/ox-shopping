import { z } from "zod";

import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { ApiError, rateLimited } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { getMailStatus, sendTestMail } from "@/lib/mail";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";

export const runtime = "nodejs";

const schema = z.object({
  to: z.string().trim().toLowerCase().email("请输入有效的邮箱地址").max(254),
});

/**
 * POST /api/admin/mail-test — 邮件通道连通性自检（真实发信）。
 *
 * 设计取舍：
 *  - **不吞异常**：业务 `sendMail` 为保证下单等主流程而吞掉发信错误，
 *    自检若照做就成了「永远成功」的伪功能。这里把真实错误交给后台展示。
 *  - **限流 + 审计**：测试邮件会真实发出（消耗服务商配额），单管理员 10 次/小时，
 *    并写审计日志留痕。
 */
export const POST = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, schema);

  const rl = await rateLimit({
    key: `admin-mail-test:${actor.id}`,
    ...RATE_LIMITS.adminMailTest,
  });
  if (!rl.ok) throw rateLimited("测试邮件发送过于频繁，请稍后再试");

  const status = await getMailStatus();

  try {
    const res = await sendTestMail(input.to);
    await audit({
      userId: actor.id,
      action: "ADMIN_MAIL_TEST",
      entity: "System",
      entityId: "mail",
      meta: { to: input.to, channel: res.channel, ok: true },
      req,
    });
    return json({ ok: true, channel: res.channel, from: res.from });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await audit({
      userId: actor.id,
      action: "ADMIN_MAIL_TEST",
      entity: "System",
      entityId: "mail",
      meta: { to: input.to, channel: status.effective, ok: false, reason },
      req,
    }).catch(() => undefined);
    throw new ApiError(400, "BAD_REQUEST", `测试邮件发送失败：${reason}`);
  }
});
