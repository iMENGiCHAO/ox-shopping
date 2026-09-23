import { apiHandler, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { getMailStatus } from "@/lib/mail";

export const runtime = "nodejs";

/**
 * GET /api/admin/mail-status — 邮件通道配置状态。
 *
 * 只暴露「是否已配置」的布尔值与变量名，**不返回任何密钥内容**。
 * 后台「系统设置 → 邮件服务」卡片据此展示：声明通道、实际生效通道、
 * 发件地址、缺失配置与「邮件不会真正送达」的告警。
 */
export const GET = apiHandler(async () => {
  await requireAdmin();
  return json({ status: getMailStatus() });
});
