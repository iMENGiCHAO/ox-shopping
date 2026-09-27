import "server-only";
import { render } from "@react-email/render";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, brandFallback } from "@/lib/env";
import {
  getMailRuntimeConfig,
  type MailRuntimeConfig,
} from "@/server/services/mail-config.service";
import { logger } from "@/lib/logger";
import { OrderCancelledEmail, OrderDeliveredEmail,
  AccountDeletedEmail,
  DataDeletionEmail,
  DistributionNoticeEmail,
  DeletionRejectedEmail,
  OrderConfirmedEmail,
  OrderShippedEmail,
  RefundUpdateEmail,
  ResetRejectedEmail,
  RestockEmail,
  TempPasswordEmail,
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
  "order-confirmed": {
    name: string;
    orderNumber: string;
    total: string;
    items: { name: string; quantity: number }[];
    orderUrl: string;
    /** 货到付款（COD）：模板切换为 COD 文案（现金送达支付，无线上支付环节） */
    isCashOnDelivery?: boolean;
    /** COD 送达应付金额（已含到付费），如 "USD 123.45" */
    codDue?: string;
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
  /** 订单取消（超时自动/用户/管理员共用模板；autoExpired 切换「未扣款」口径） */
  "order-cancelled": {
    name: string;
    orderNumber: string;
    orderUrl: string;
    autoExpired?: boolean;
    lang?: MailLang;
  };
  /** 订单完成（确认收货/自动确认收货） */
  "order-delivered": {
    name: string;
    orderNumber: string;
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
  /**
   * 找回密码申请通过 → 下发临时密码（B-2）。
   * `loginUrl` 指向登录页，用户登录后会被强制跳强制改密页。
   */
  "temp-password": {
    name: string;
    tempPassword: string;
    loginUrl: string;
    lang?: MailLang;
  };
  /** 找回密码申请被驳回（reason 为客服备注，可选） */
  "reset-rejected": {
    name: string;
    reason?: string;
    contactUrl: string;
    lang?: MailLang;
  };
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
   * 分销通知（佣金结算/冲正、提现状态、成为分销商）。
   * 文案由 `distribution/notify.service.ts` 本地化后传入 —— 事件会持续增加，
   * 邮件层不为此膨胀成一堆近乎相同的模板组件。
   */
  "distribution-notice": {
    name: string;
    title: string;
    body: string;
    ctaText?: string;
    ctaUrl?: string;
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
    subject: (lang, brand) =>
      subjectLine(lang, brand, "请验证您的邮箱地址", "Verify your email address"),
    render: (data) => render(VerifyEmailEmail(data as never)),
  },
  "order-confirmed": {
    /* COD 单无「支付成功」语义，主题用对在线单/现金单均准确的「订单已确认」 */
    subject: (lang, brand) => subjectLine(lang, brand, "订单已确认", "Order confirmed"),
    render: (data) => render(OrderConfirmedEmail(data as never)),
  },
  "order-shipped": {
    subject: (lang, brand) => subjectLine(lang, brand, "您的包裹已发货", "Your order has shipped"),
    render: (data) => render(OrderShippedEmail(data as never)),
  },
  "order-cancelled": {
    subject: (lang, brand) => subjectLine(lang, brand, "订单已取消", "Your order has been cancelled"),
    render: (data) => render(OrderCancelledEmail(data as never)),
  },
  "order-delivered": {
    subject: (lang, brand) => subjectLine(lang, brand, "订单已完成", "Your order is complete"),
    render: (data) => render(OrderDeliveredEmail(data as never)),
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
  "temp-password": {
    subject: (lang, brand) =>
      subjectLine(lang, brand, "您的临时密码已发放", "Your temporary password"),
    render: (data) => render(TempPasswordEmail(data as never)),
  },
  "reset-rejected": {
    subject: (lang, brand) =>
      subjectLine(
        lang,
        brand,
        "您的找回密码申请未通过",
        "Your password recovery request was declined",
      ),
    render: (data) => render(ResetRejectedEmail(data as never)),
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
  "distribution-notice": {
    // 主题行即业务标题（调用方已本地化），品牌名统一由 subjectLine 拼接
    subject: (lang, brand) => subjectLine(lang, brand, "分销动态", "Distribution update"),
    render: (data) => render(DistributionNoticeEmail(data as never)),
  },
};

export interface SendMailInput<T extends MailTemplate = MailTemplate> {
  to: string;
  template: T;
  data: MailData[T];
}

/* 客户端按**配置指纹**缓存：配置在后台改过后必须重建 —— 否则改了主机/密码
   仍会用旧连接池发信（表现为「保存成功但发信还是失败」的诡异现象）。 */
let resendClient: { key: string; client: Resend } | null = null;
let smtpTransport: { fingerprint: string; transport: nodemailer.Transporter } | null = null;

/** 实际生效通道：声明通道缺凭据时降级为 console（状态里会显式告警） */
function effectiveChannel(cfg: MailRuntimeConfig): "resend" | "smtp" | "console" {
  if (cfg.provider === "resend" && cfg.resend.apiKey) return "resend";
  if (cfg.provider === "smtp" && cfg.smtp.host) return "smtp";
  return "console";
}

async function sendViaResend(to: string, subject: string, html: string, cfg: MailRuntimeConfig) {
  const key = cfg.resend.apiKey;
  if (!resendClient || resendClient.key !== key) {
    resendClient = { key, client: new Resend(key) };
  }
  const { error } = await resendClient.client.emails.send({
    from: cfg.from,
    to,
    subject,
    html,
  });
  if (error) throw new Error(`Resend 发送失败: ${error.message}`);
}

async function sendViaSmtp(to: string, subject: string, html: string, cfg: MailRuntimeConfig) {
  const fp = `${cfg.smtp.host}:${cfg.smtp.port}:${cfg.smtp.secure}:${cfg.smtp.user}`;
  if (!smtpTransport || smtpTransport.fingerprint !== fp) {
    smtpTransport = {
      fingerprint: fp,
      transport: nodemailer.createTransport({
        host: cfg.smtp.host,
        port: cfg.smtp.port,
        secure: cfg.smtp.secure,
        auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
      }),
    };
  }
  await smtpTransport.transport.sendMail({
    from: cfg.from,
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

export type MailDeliveryChannel = "resend" | "smtp" | "console";

/**
 * 邮件投递结果。`sendMail` 改为返回结果而不是仅记录日志，调用方仍可像以前一样
 * `await` / `void` / 忽略返回值，因此对既有调用完全向后兼容。
 */
export interface MailSendResult {
  /** 仅真实发送通道成功返回 true；console 落盘不等于已投递。 */
  delivered: boolean;
  channel: MailDeliveryChannel;
  error?: string;
}

/** 发送邮件。发送失败只记录日志，不阻断既有业务流程，并返回可供重试判断的结果。 */
export async function sendMail<T extends MailTemplate>(
  input: SendMailInput<T>,
): Promise<MailSendResult> {
  let channel: MailDeliveryChannel = "console";
  try {
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
    // 通道与发件人取**运行时配置**（后台可改，保存后立即生效；env 仅兜底）
    const cfg = await getMailRuntimeConfig();
    channel = effectiveChannel(cfg);
    if (channel === "resend") {
      await sendViaResend(input.to, subject, html, cfg);
    } else if (channel === "smtp") {
      await sendViaSmtp(input.to, subject, html, cfg);
    } else {
      await sendViaConsole(input.to, subject, html, input.template);
    }
    // console 只落日志/本地文件，不能宣称邮件已实际送达；需要可靠投递的调用方可留 draft 重试。
    if (channel === "console") {
      return { delivered: false, channel };
    }
    logger.info({ to: input.to, template: input.template, channel }, "邮件已发送");
    return { delivered: true, channel };
  } catch (err) {
    // 邮件失败不改变既有「不抛异常」行为，但把失败显式交给到货提醒等服务做重试判断。
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: input.to, template: input.template }, "邮件发送失败");
    return { delivered: false, channel, error };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   邮件通道状态与连通性自检（后台「系统设置 → 邮件服务」卡片）
   ──────────────────────────────────────────────────────────────────────────
   为什么需要：`sendMail` 在通道配置不全时**静默降级**到 console —— 只打日志 +
   落盘 .mail-out。运营对此完全无感知：以为订单确认、发货通知、到货提醒都发出去了，
   实际上全被丢弃。这里把「声明通道 / 实际生效通道 / 缺失的配置项」显式暴露到后台，
   并提供**真实发信**的连通性自检（失败返回真实错误，不是转圈的伪按钮）。
   ══════════════════════════════════════════════════════════════════════════ */

export interface MailChannelCheck {
  /** .env 变量名（后台按名展示，便于运维直接定位） */
  key: string;
  label: string;
  configured: boolean;
  /** 该通道下是否必需：用于区分「必填缺失」与「可选未配」 */
  required: boolean;
}

export interface MailStatus {
  /** 选择的通道（后台配置优先，未配置时取环境变量） */
  provider: "resend" | "smtp" | "console";
  /** 实际生效通道：所选通道缺凭据时降级为 console */
  effective: "resend" | "smtp" | "console";
  from: string;
  /** 配置来源：db = 后台配置过；env = 完全由环境变量兜底 */
  source: "db" | "env";
  /** 业务邮件能否真正送达收件人（console 一律视为不可送达） */
  deliverable: boolean;
  checks: MailChannelCheck[];
  /** 配置不完整时的运营提示（说清后果，而非只报「未配置」） */
  warning?: string;
}

/**
 * 当前邮件通道状态（**异步**：通道与凭据来自后台可配的运行时配置）。
 * 后台「系统设置 → 邮件服务」据此展示：所选通道、实际生效通道、配置来源、
 * 发件地址、缺失配置，以及「邮件不会真正送达」的告警。
 */
export async function getMailStatus(): Promise<MailStatus> {
  const cfg = await getMailRuntimeConfig();
  const isResend = cfg.provider === "resend";
  const isSmtp = cfg.provider === "smtp";

  const checks: MailChannelCheck[] = isResend
    ? [
        {
          key: "resendApiKey",
          label: "Resend API Key",
          configured: !!cfg.resend.apiKey,
          required: true,
        },
      ]
    : isSmtp
      ? [
          { key: "smtpHost", label: "SMTP 主机", configured: !!cfg.smtp.host, required: true },
          { key: "smtpPort", label: "SMTP 端口", configured: cfg.smtp.port > 0, required: true },
          { key: "smtpUser", label: "SMTP 用户名", configured: !!cfg.smtp.user, required: false },
          { key: "smtpPass", label: "SMTP 密码", configured: !!cfg.smtp.pass, required: false },
        ]
      : [];

  const effective = effectiveChannel(cfg);
  const deliverable = effective !== "console";
  const missing = checks.filter((c) => c.required && !c.configured).map((c) => c.label);

  return {
    provider: cfg.provider,
    effective,
    from: cfg.from,
    source: cfg.source,
    deliverable,
    checks,
    warning: deliverable
      ? undefined
      : missing.length > 0
        ? `已选择 ${cfg.provider} 通道，但缺少必需配置：${missing.join("、")}。` +
          `当前所有邮件（订单确认、发货通知、到货提醒、找回密码等）只会写入日志，` +
          `不会真正送达顾客 —— 请在下方补齐配置（保存后立即生效）。`
        : "当前通道为「仅写日志」：所有邮件只会写入日志与本地 .mail-out 目录，不会真正送达顾客。请选择 SMTP 或 Resend 并填写配置。",
  };
}

/**
 * 发送测试邮件 —— 走与业务邮件**完全相同**的通道，但失败时抛错。
 *
 * 与 `sendMail` 的差异只有一处：业务发信吞掉异常以保证主流程，
 * 自检必须把真实错误交回后台（否则又是一个「转圈圈」的伪功能）。
 */
export async function sendTestMail(to: string): Promise<{ channel: string; from: string }> {
  const cfg = await getMailRuntimeConfig();
  const channel = effectiveChannel(cfg);
  const subject = `【邮件通道自检】${brandFallback}`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.7;color:#111">
  <h2 style="margin:0 0 12px">邮件通道自检</h2>
  <p>这封邮件由后台「系统设置 → 邮件服务」发出，用于验证当前邮件通道可用。</p>
  <p style="color:#555">This is a test email from the admin panel to verify the mail channel.</p>
  <p style="color:#555;font-size:13px;margin-top:16px">
    通道 / Channel: <code>${channel}</code><br/>
    发件人 / From: ${cfg.from}
  </p>
</body></html>`;

  if (channel === "resend") {
    await sendViaResend(to, subject, html, cfg);
  } else if (channel === "smtp") {
    await sendViaSmtp(to, subject, html, cfg);
  } else {
    await sendViaConsole(to, subject, html, "mail-test");
  }
  return { channel, from: cfg.from };
}
