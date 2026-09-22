import { apiHandler, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { getClientIp } from "@/lib/server/utils-server";
import { getLang } from "@/lib/shop-i18n-server";
import { getSiteSettings } from "@/server/services/settings.service";
import { sendMail } from "@/lib/mail";
import { logger } from "@/lib/logger";
import { z } from "zod";

export const runtime = "nodejs";

/** 联系表单入参。字段与原站 `/pages/contact` 逐项对齐：Name / E-mail / Message。 */
const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Invalid email format").max(254),
  message: z.string().trim().min(1, "Please enter your message").max(5000),
  /**
   * 蜜罐字段（与注册表单同一手法）：对真人不可见，机器人自动填表常会填上。
   * 命中时不写库、不发信，但仍返回成功 —— 不给机器人可观测的失败信号。
   */
  company: z.string().max(200).optional(),
});

/**
 * POST /api/contact —— 联系表单留言（公开接口）。
 *
 * 设计取舍：
 *  - **先落库再发信**：邮件通道可能未配置（`MAIL_PROVIDER=console` 只打日志）
 *    或临时故障，只发信会静默丢单。落库保证留言不丢，后台可查；
 *    发信失败只记日志，不影响本次提交的成功响应。
 *  - **按 IP 限流**：公开表单必须防灌水；1 小时 5 条对正常用户绰绰有余。
 *  - CSRF 由 `proxy.ts` 统一校验（`apiFetch` 会自动带 double-submit 头）。
 */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, schema);
  const ip = getClientIp(req);

  // 单标识 5 次/小时 + 全站熔断 200 次/小时（留言会发内部邮件，防标识轮换刷邮件配额）
  const rl = await rateLimit({
    key: `contact:${ip}`,
    ...RATE_LIMITS.contact,
  });
  if (!rl.ok) throw rateLimited("Too many messages, please try again later");

  // 蜜罐命中：静默丢弃
  if (input.company) {
    logger.warn({ ip }, "[contact] 蜜罐命中，已丢弃");
    return json({ ok: true }, { status: 201 });
  }

  const lang = await getLang();
  const row = await prisma.contactMessage.create({
    data: {
      name: input.name,
      email: input.email,
      message: input.message,
      lang,
      ip: ip === "unknown" ? null : ip,
      source: "contact-page",
    },
  });

  // 通知运营者：失败不影响本次提交（留言已入库，后台可查）
  try {
    const settings = await getSiteSettings();
    if (settings.contactEmail) {
      await sendMail({
        to: settings.contactEmail,
        template: "contact-message",
        // 不传 lang：运营侧通知走 sendMail 的默认语言（zh），不随顾客语种变化
        data: {
          name: row.name,
          email: row.email,
          message: row.message,
          source: row.source,
        },
      });
      await prisma.contactMessage.update({ where: { id: row.id }, data: { notified: true } });
    } else {
      logger.warn({ id: row.id }, "[contact] 未配置客服邮箱，留言已入库但未发通知");
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, id: row.id },
      "[contact] 留言通知邮件发送失败（留言已入库）",
    );
  }

  return json({ ok: true, id: row.id }, { status: 201 });
});
