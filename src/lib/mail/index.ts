import "server-only";
import { render } from "@react-email/render";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  DataDeletionEmail,
  OrderConfirmedEmail,
  OrderShippedEmail,
  RefundUpdateEmail,
  ResetPasswordEmail,
  RestockEmail,
  VerifyEmailEmail,
} from "@/emails/templates";


/**
 * 邮件服务：resend | smtp | console(未配置时降级为控制台输出 + 本地 .mail-out 目录)
 * 模板使用 react-email 组件，经 @react-email/render 渲染为 HTML。
 *
 * 语言策略：subject 与正文按 `lang` 渲染。`lang` 通常来自调用方（注册/下单时
 * 取自 user 的偏好或 cookie）。默认 zh，对未登录场景（如忘记密码）友好。
 */

export type MailLang = "zh" | "en";

export interface MailData {
  "verify-email": { name: string; link: string; lang?: MailLang };
  "reset-password": { name: string; link: string; lang?: MailLang };
  "order-confirmed": {
    name: string;
    orderNumber: string;
    total: string;
    items: { name: string; quantity: number }[];
    orderUrl: string;
    lang?: MailLang;
  };
  "order-shipped": {
    name: string;
    orderNumber: string;
    trackingCompany: string;
    trackingNumber: string;
    orderUrl: string;
    lang?: MailLang;
  };
  "refund-update": {
    name: string;
    orderNumber: string;
    statusText: string;
    amount: string;
    note?: string;
    orderUrl: string;
    lang?: MailLang;
  };
  "data-deletion": { name: string; lang?: MailLang };
  "restock": {
    name: string;
    productName: string;
    /** 客户登记时选择的规格文本，如 "Color: Black / Size: M" */
    variantText?: string;
    /** 商品卡：首图（绝对 URL）与卖点节选（到货提醒即广告） */
    image?: string;
    excerpt?: string;
    priceText: string;
    compareAtText?: string;
    productUrl: string;
    lang?: MailLang;
  };
}

export type MailTemplate = keyof MailData;

interface TemplateMeta {
  subject: (lang: MailLang) => string;
  // Each template renders with its own props (BaseProps + template-specific fields).
  // Using a generic renderer avoids having to enumerate every template's props here.
  render: (data: Record<string, unknown>) => string;
}

const siteNameFor = (_lang: MailLang) => "Ox Shopping";

const templates: Record<MailTemplate, TemplateMeta> = {
  "verify-email": {
    subject: (lang) =>
      lang === "zh" ? "【Ox Shopping】请验证您的邮箱地址" : "[Ox Shopping] Verify your email address",
    render: (data) => render(VerifyEmailEmail(data as never)),
  },
  "reset-password": {
    subject: (lang) =>
      lang === "zh" ? "【Ox Shopping】重置密码" : "[Ox Shopping] Reset your password",
    render: (data) => render(ResetPasswordEmail(data as never)),
  },
  "order-confirmed": {
    subject: (lang) =>
      lang === "zh" ? "【Ox Shopping】订单支付成功" : "[Ox Shopping] Order payment confirmed",
    render: (data) => render(OrderConfirmedEmail(data as never)),
  },
  "order-shipped": {
    subject: (lang) =>
      lang === "zh" ? "【Ox Shopping】您的包裹已发货" : "[Ox Shopping] Your order has shipped",
    render: (data) => render(OrderShippedEmail(data as never)),
  },
  "refund-update": {
    subject: (lang) =>
      lang === "zh" ? "【Ox Shopping】退款进度更新" : "[Ox Shopping] Refund status update",
    render: (data) => render(RefundUpdateEmail(data as never)),
  },
  "data-deletion": {
    subject: (lang) =>
      lang === "zh"
        ? "【Ox Shopping】数据删除请求已收到"
        : "[Ox Shopping] Data deletion request received",
    render: (data) => render(DataDeletionEmail(data as never)),
  },
  "restock": {
    subject: (lang) =>
      lang === "zh"
        ? "【Ox Shopping】您关注的商品已补货"
        : "[Ox Shopping] Back in stock — the item you wanted",
    render: (data) => render(RestockEmail(data as never)),
  },
};

export interface SendMailInput<T extends MailTemplate = MailTemplate> {
  to: string;
  template: T;
  data: MailData[T];
}

let resendClient: Resend | null = null;
let smtpTransport: nodemailer.Transporter | null = null;

async function sendViaResend(to: string, subject: string, html: string) {
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);
  const { error } = await resendClient.emails.send({
    from: env.MAIL_FROM,
    to,
    subject,
    html,
  });
  if (error) throw new Error(`Resend 发送失败: ${error.message}`);
}

async function sendViaSmtp(to: string, subject: string, html: string) {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  await smtpTransport.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    html,
  });
}

async function sendViaConsole(to: string, subject: string, html: string, template: string) {
  // 开发模式：打印日志并落盘 HTML 便于浏览器预览
  logger.info({ to, subject, template }, "[mock-mail] 邮件内容(未配置邮件服务)");
  try {
    const dir = path.join(process.cwd(), ".mail-out");
    await mkdir(dir, { recursive: true });
    const file = path.join(
      dir,
      `${Date.now()}-${template}-${to.replace(/[^a-zA-Z0-9@._-]/g, "_")}.html`,
    );
    await writeFile(file, html, "utf8");
    logger.info({ file }, "[mock-mail] 已保存到本地文件");
  } catch (err) {
    logger.warn({ err }, "[mock-mail] 落盘失败");
  }
}

/** 发送邮件。发送失败只记录日志，不阻断业务流程。 */
export async function sendMail<T extends MailTemplate>(input: SendMailInput<T>): Promise<void> {
  const meta = templates[input.template];
  // 前台面向欧美客户：未显式指定语言时默认英文
const lang: MailLang = (input.data as { lang?: MailLang }).lang ?? "en";
  // Inject brand name + url into every payload — these are derived from env /
  // language so individual callers don't have to remember to set them.
  const base = { siteUrl: env.SITE_URL, siteName: siteNameFor(lang) };
  const data = { ...base, ...(input.data as object) };
  const html = meta.render(data);
  const subject = meta.subject(lang);
  try {
    if (env.MAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
      await sendViaResend(input.to, subject, html);
    } else if (env.MAIL_PROVIDER === "smtp" && env.SMTP_HOST) {
      await sendViaSmtp(input.to, subject, html);
    } else {
      await sendViaConsole(input.to, subject, html, input.template);
    }
    logger.info({ to: input.to, template: input.template }, "邮件已发送");
  } catch (err) {
    // 邮件失败不应阻断主流程(订单仍创建成功)
    logger.error({ err, to: input.to, template: input.template }, "邮件发送失败");
  }
}
