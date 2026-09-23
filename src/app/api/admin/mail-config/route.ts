import { z } from "zod";

import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { getMailStatus } from "@/lib/mail";
import { getMailConfigForAdmin, saveMailConfig } from "@/server/services/mail-config.service";

export const runtime = "nodejs";

const schema = z.object({
  provider: z.enum(["console", "smtp", "resend"]),
  from: z.string().trim().max(200).optional(),
  smtpHost: z.string().trim().max(200).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().trim().max(200).optional(),
  /** 密钥字段：空串或掩码 = 保留原值（永不回显明文） */
  smtpPass: z.string().max(500).optional(),
  resendApiKey: z.string().max(500).optional(),
});

/**
 * GET /api/admin/mail-config — 邮件通道配置（脱敏）+ 当前状态。
 *
 * 合并了原先独立的 `/api/admin/mail-status`：配置与状态本就是同一张卡片的两半，
 * 拆成两个端点只会让前端多一次往返、多一个无人调用的端点。
 */
export const GET = apiHandler(async () => {
  await requireAdmin();
  const [config, status] = await Promise.all([getMailConfigForAdmin(), getMailStatus()]);
  return json({ config, status });
});

/**
 * PUT /api/admin/mail-config — 保存邮件通道配置。
 *
 * 设计要点：
 *  · **允许渐进填写**：选了通道但字段没填全也允许保存（状态卡片会持续告警
 *    「缺少必需配置」）—— 比"保存即拒绝"更贴合运营先选通道再逐项配置的节奏；
 *  · 密钥**加密落库**、接口只回「是否已配置」；掩码/空值 = 保留原值；
 *  · 审计只记通道与「是否更新了密钥」，**不记密钥内容**。
 */
export const PUT = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, schema);

  const before = await getMailConfigForAdmin();
  const config = await saveMailConfig({
    provider: input.provider,
    ...(input.from !== undefined ? { from: input.from } : {}),
    ...(input.smtpHost !== undefined ? { smtpHost: input.smtpHost } : {}),
    ...(input.smtpPort !== undefined ? { smtpPort: input.smtpPort } : {}),
    ...(input.smtpSecure !== undefined ? { smtpSecure: input.smtpSecure } : {}),
    ...(input.smtpUser !== undefined ? { smtpUser: input.smtpUser } : {}),
    ...(input.smtpPass !== undefined ? { smtpPass: input.smtpPass } : {}),
    ...(input.resendApiKey !== undefined ? { resendApiKey: input.resendApiKey } : {}),
  });

  await audit({
    userId: actor.id,
    action: "ADMIN_MAIL_CONFIG_UPDATE",
    entity: "SiteSetting",
    entityId: "mail_config",
    meta: {
      provider: config.provider,
      providerChanged: before.provider !== config.provider,
      smtpPassConfigured: config.hasSmtpPass,
      resendKeyConfigured: config.hasResendApiKey,
    },
    req,
  });

  return json({ config, status: await getMailStatus() });
});
