import "server-only";
import { render } from "@react-email/render";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, brandFallback, mailFrom } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  AccountDeletedEmail,
  ContactMessageEmail,
  DataDeletionEmail,
  DeletionRejectedEmail,
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

/**
 * 邮件发送时使用的站名解析。优先读 SiteSetting 多语字段，缺失回退到 env.SITE_NAME。
 * 为避免在邮件模板中硬编码品牌名，业务方应通过 SiteSetting 设置 siteName.zh / siteName.en。
 */
async function loadSiteName(): Promise<{ zh?: string; en?: string }> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.siteSetting
      .findUnique({ where: { key: "siteName" } })
      .catch(() => null);
    if (row && typeof row.value === "object" && row.value !== null) {
      const v = row.value as { zh?: string; en?: string };
      return { zh: v.zh, en: v.en };
    }
  } catch {
    /* DB 不可用时走兜底 */
  }
  return { zh: undefined, en: undefined };
}

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
  /** 注销处理完成（admin 确认注销，匿名化前发往原邮箱） */
  "account-deleted": { name: string; lang?: MailLang };
  /** 注销申请驳回（admin 驳回，note 为客服备注可选） */
  "deletion-rejected": { name: string; note?: string; lang?: MailLang };
  restock: {
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
    /** 预售商品开售 → 邮件标题/正文切换为「预购开售」口径 */
    isPresale?: boolean;
    lang?: MailLang;
  };
  /**
   * 联系表单留言 → 发给**站点运营者**（不是顾客）。
   * 收件地址由 `settings.contactEmail`（后台客服邮箱 / SUPPORT_EMAIL 兜底）决定。
   */
  "contact-message": {
    name: string;
    email: string;
    message: string;
    source: string;
    lang?: MailLang;
  };
}

export type MailTemplate = keyof MailData;

interface TemplateMeta {
  /** 主题行：品牌名取自 SiteSetting（多语），不写死 */
  subject: (lang: MailLang, siteName: string) => string;
  // Each template renders with its own props (BaseProps + template-specific fields).
  // Using a generic renderer avoids having to enumerate every template's props here.
  // @react-email/render v1：render() 为异步
  render: (data: Record<string, unknown>) => Promise<string>;
}

const siteNameFor = (lang: MailLang, names: { zh?: string; en?: string }) => {
  const fromSetting = lang === "zh" ? names.zh : names.en;
  return fromSetting || brandFallback;
};

/** 主题行统一格式：中文 `【品牌】正文`，英文 `[Brand] Body` */
const subjectLine = (lang: MailLang, siteName: string, zh: string, en: string) =>
  lang === "zh" ? `【${siteName}】${zh}` : `[${siteName}] ${en}`;

const templates: Record<MailTemplate, TemplateMeta> = {
  "verify-email": {
    subject: (lang, brand) => subjectLine(lang, brand, "请验证您的邮箱地址", "Verify your email address"),
    render: (data) => render(VerifyEmailEmail(data as never)),
  },
  "reset-password": {
    subject: (lang, brand) => subjectLine(lang, brand, "重置密码", "Reset your password"),
    render: (data) => render(ResetPasswordEmail(data as never)),
  },
  "order-confirmed": {
    subject: (lang, brand) =>
      subjectLine(lang, brand, "订单支付成功", "Order payment confirmed"),
    render: (data) => render(OrderConfirmedEmail(data as never)),
  },
  "order-shipped": {
    subject: (lang, brand) =>
      subjectLine(lang, brand, "您的包裹已发货", "Your order has shipped"),
    render: (data) => render(OrderShippedEmail(data as never)),
  },
  "refund-update": {
    subject: (lang, brand) => subjectLine(lang, brand, "退款进度更新", "Refund status update"),
    render: (data) => render(RefundUpdateEmail(data as never)),
  },
  "data-deletion": {
    subject: (lang, brand) =>
      subjectLine(lang, brand, "数据删除请求已收到", "Data deletion request received"),
    render: (data) => render(DataDeletionEmail(data as never)),
  },
  "account-deleted": {
    subject: (lang, brand) =>
      subjectLine(lang, brand, "您的注销申请已处理完成", "Your account deletion is complete"),
    render: (data) => render(AccountDeletedEmail(data as never)),
  },
  "deletion-rejected": {
    subject: (lang, brand) =>
      subjectLine(lang, brand, "您的注销申请未通过", "Your account deletion request was declined"),
    render: (data) => render(DeletionRejectedEmail(data as never)),
  },
  restock: {
    subject: (lang, brand) =>
      subjectLine(lang, brand, "您关注的商品已补货", "Back in stock — the item you wanted"),
    render: (data) => render(RestockEmail(data as never)),
  },
  "contact-message": {
    // 收件人是内部运营，主题行用运营侧语言（默认 zh），不随顾客语种变化
    subject: (lang, brand) =>
      subjectLine(lang, brand, "收到新的联系表单留言", "New contact form message"),
    render: (data) => render(ContactMessageEmail(data as never)),
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
    from: mailFrom,
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
    from: mailFrom,
    to,
    subject,
    html,
  });
}

async function sendViaConsole(to: string, subject: string, html: string, template: string) {
  // 开发模式：打印日志并落盘 HTML 便于浏览器预览
  logger.info({ to, subject, template }, "[mock-mail] 邮件内容(未配置邮件服务)");
  try {
    // 落盘目录可配置：默认 .mail-out，部署可指向卷外(避免备份盘膨胀)
    const dir = process.env.MAIL_OUT_DIR || path.join(process.cwd(), ".mail-out");
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
  // 语言策略：调用方显式指定 > 默认 zh（与项目主语言一致；忘记密码等未登录场景友好）
  const lang: MailLang = (input.data as { lang?: MailLang }).lang ?? "zh";
  // 从 SiteSetting 拉取品牌名（多语），缺失兜底 "Ox Shopping"
  const names = await loadSiteName();
  // Inject brand name + url into every payload — these are derived from env /
  // language so individual callers don't have to remember to set them.
  const base = { siteUrl: env.SITE_URL, siteName: siteNameFor(lang, names) };
  const data = { ...base, ...(input.data as object) };
  const html = await meta.render(data);
  const subject = meta.subject(lang, base.siteName);
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
