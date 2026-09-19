import {
  Body,
  Button,
  Container,
  Column,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface BaseProps {
  siteUrl: string;
  siteName: string;
  lang?: "zh" | "en";
}

type Lang = "zh" | "en";

const baseStyle = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  color: "#1f2937",
} as const;

/** Locale bundle for email copy. Each template picks the strings it needs. */
const COPY = {
  footer: {
    zh: { auto: "此邮件由系统自动发送，请勿直接回复。", visit: (s: string) => `访问 ${s}` },
    en: {
      auto: "This is an automated email — please do not reply.",
      visit: (s: string) => `Visit ${s}`,
    },
  },
  verify: {
    zh: {
      preview: (s: string) => `欢迎加入${s}，请验证您的邮箱`,
      title: "验证您的邮箱地址",
      greet: (n: string) => `您好，${n}：`,
      body: (s: string) => `感谢注册 ${s}。请点击下方按钮完成邮箱验证(24 小时内有效)：`,
      cta: "验证邮箱",
      fallback: "如果按钮无法点击，请复制以下链接到浏览器打开：",
      ignore: "如果这不是您本人的操作，请忽略此邮件。",
    },
    en: {
      preview: (s: string) => `Welcome to ${s} — please verify your email`,
      title: "Verify your email address",
      greet: (n: string) => `Hi ${n},`,
      body: (s: string) =>
        `Thanks for joining ${s}. Please click the button below to verify your email (valid for 24 hours):`,
      cta: "Verify email",
      fallback: "If the button doesn't work, copy and paste this link into your browser:",
      ignore: "If this wasn't you, please ignore this email.",
    },
  },
  reset: {
    zh: {
      preview: "重置您的账户密码",
      title: "重置密码",
      greet: (n: string) => `您好，${n}：`,
      body: "我们收到您的密码重置请求。点击下方按钮设置新密码(30 分钟内有效)：",
      cta: "重置密码",
      fallback: "或复制链接到浏览器打开：",
      ignore: "如果这不是您本人的操作，请忽略此邮件，您的密码不会被修改。",
    },
    en: {
      preview: "Reset your account password",
      title: "Reset your password",
      greet: (n: string) => `Hi ${n},`,
      body: "We received a request to reset your password. Click the button below to set a new password (valid for 30 minutes):",
      cta: "Reset password",
      fallback: "Or copy and paste the link into your browser:",
      ignore: "If this wasn't you, please ignore this email — your password will remain unchanged.",
    },
  },
  orderConfirmed: {
    zh: {
      preview: (n: string) => `订单 ${n} 已确认`,
      title: "订单支付成功",
      greet: (n: string) => `您好，${n}：`,
      body: (n: string) => `订单 <strong>${n}</strong> 已完成支付，我们将尽快为您发货。`,
      total: "实付金额",
      cta: "查看订单详情",
    },
    en: {
      preview: (n: string) => `Order ${n} confirmed`,
      title: "Payment received",
      greet: (n: string) => `Hi ${n},`,
      body: (n: string) =>
        `Your order <strong>${n}</strong> has been paid. We will ship it as soon as possible.`,
      total: "Total paid",
      cta: "View order details",
    },
  },
  orderShipped: {
    zh: {
      preview: (n: string) => `订单 ${n} 已发货`,
      title: "您的包裹已发货",
      greet: (n: string) => `您好，${n}：`,
      body: (n: string) => `订单 <strong>${n}</strong> 已发货，请注意查收。`,
      carrier: "物流公司",
      tracking: "物流单号",
      cta: "查看订单",
    },
    en: {
      preview: (n: string) => `Order ${n} has shipped`,
      title: "Your order has shipped",
      greet: (n: string) => `Hi ${n},`,
      body: (n: string) =>
        `Your order <strong>${n}</strong> has shipped — please keep an eye out for delivery.`,
      carrier: "Carrier",
      tracking: "Tracking number",
      cta: "View order",
    },
  },
  refundUpdate: {
    zh: {
      preview: (n: string) => `订单 ${n} 退款进度更新`,
      title: "退款进度更新",
      greet: (n: string) => `您好，${n}：`,
      body: (n: string) => `订单 <strong>${n}</strong> 的退款申请状态已更新为：`,
      amount: "退款金额",
      note: "备注",
      cta: "查看订单",
    },
    en: {
      preview: (n: string) => `Refund update for order ${n}`,
      title: "Refund status update",
      greet: (n: string) => `Hi ${n},`,
      body: (n: string) =>
        `The refund request for order <strong>${n}</strong> has been updated to:`,
      amount: "Refund amount",
      note: "Note",
      cta: "View order",
    },
  },
  dataDeletion: {
    zh: {
      preview: "数据删除请求已收到",
      title: "数据删除请求已收到",
      greet: (n: string) => `您好，${n}：`,
      body: "我们已收到您的账户数据删除请求，将在 <strong>30 个自然日内</strong>完成处理。处理完成后，您的账户及关联数据将被删除。",
      note: "处理完成前您可随时登录本站，在「个人资料」页自助撤回该申请。",
      link: (u: string) => `${u}/account/profile`,
      suffix: "撤回后账户立即恢复正常。",
    },
    en: {
      preview: "Data deletion request received",
      title: "Data deletion request received",
      greet: (n: string) => `Hi ${n},`,
      body: "We have received your account data deletion request and will process it within <strong>30 calendar days</strong>. Once completed, your account and associated data will be deleted.",
      note: "Before processing, you can withdraw this request anytime on the Profile page after signing in:",
      link: (u: string) => `${u}/account/profile`,
      suffix: "Your account returns to normal immediately after withdrawal.",
    },
  },
  accountDeleted: {
    zh: {
      preview: "您的注销申请已处理完成",
      title: "您的注销申请已处理完成",
      greet: () => "您好：",
      body: "您的账户注销申请已处理完成。您的个人身份信息（姓名、邮箱、登录凭证）已从系统中清除，本邮箱将不再收到本站的任何通知。",
      note: "为满足财务与法律合规要求，历史订单记录将以匿名形式保留，其中不再含任何可识别您个人身份的信息。",
      hint: "如需继续使用本站，欢迎使用新邮箱重新注册。",
    },
    en: {
      preview: "Your account deletion is complete",
      title: "Your account deletion is complete",
      greet: () => "Hi,",
      body: "Your account deletion request has been processed. Personally identifiable information (name, email, sign-in credentials) has been removed from our system, and this email address will no longer receive any notifications from us.",
      note: "To meet financial and legal compliance requirements, historical order records are retained in anonymized form and no longer contain information identifying you.",
      hint: "If you'd like to keep shopping with us, you're welcome to sign up again with a new email address.",
    },
  },
  deletionRejected: {
    zh: {
      preview: "您的注销申请未通过",
      title: "您的注销申请未通过",
      greet: (n: string) => `您好，${n}：`,
      body: "经核实，您的注销申请暂未通过，您的账户未做任何变更，可继续正常使用。",
      noteLabel: "客服备注：",
      hint: "如有疑问，请联系客服咨询详情。",
    },
    en: {
      preview: "Your account deletion request was declined",
      title: "Your account deletion request was declined",
      greet: (n: string) => `Hi ${n},`,
      body: "After review, your account deletion request was declined. Your account is unchanged and remains fully usable.",
      noteLabel: "Support note:",
      hint: "If you have questions, please contact customer support.",
    },
  },
  restock: {
    zh: {
      preview: (p: string) => `您关注的「${p}」已现货回归`,
      title: "您关注的商品到货啦",
      presaleTitle: "您预购的商品已到货开售",
      greet: (n: string) => `您好，${n}：`,
      body: "您登记到货通知的商品已有现货，数量有限，先到先得：",
      presaleBody: "您登记的预售商品已到货并开售，付款后将按顺序发出，数量有限，先到先得：",
      variant: "您关注的规格",
      urgency: "库存有限，售完即止",
      cta: "立即购买",
      hint: "此提醒来自您曾登记的到货通知（一对一发送，仅针对您登记的商品），如不想再收到可忽略本邮件。",
    },
    en: {
      preview: (p: string) => `${p} is back in stock`,
      title: "Back in stock — the item you wanted is here",
      presaleTitle: "Pre-order now available",
      greet: (n: string) => `Hi ${n},`,
      body: "Good news — the item you signed up for is back in stock. Limited quantity, first come first served:",
      presaleBody:
        "The pre-order item you signed up for has arrived and is now shipping. Orders are fulfilled in the order received — limited quantity, first come first served:",
      variant: "Variant you asked about",
      urgency: "Limited stock — once it's gone, it's gone",
      cta: "Shop now",
      hint: "You're receiving this because you signed up for a restock notification (one-to-one, only for the item you chose). Ignore this email if you no longer want updates.",
    },
  },
} as const;

function pick<T extends Record<Lang, unknown>>(obj: T, lang: Lang): T[Lang] {
  return (obj[lang] ?? obj.zh) as T[Lang];
}

function EmailShell({
  siteUrl,
  siteName,
  preview,
  children,
  lang = "zh",
}: BaseProps & { preview: string; children: React.ReactNode }) {
  const f = pick(COPY.footer, lang);
  return (
    <Html lang={lang === "zh" ? "zh-CN" : "en"}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f3f4f6", ...baseStyle }}>
        <Container
          style={{
            maxWidth: 600,
            margin: "24px auto",
            backgroundColor: "#ffffff",
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
          <Section style={{ backgroundColor: "#111827", padding: "24px 32px" }}>
            <Text style={{ color: "#ffffff", fontSize: 20, fontWeight: 700, margin: 0 }}>
              {siteName}
            </Text>
          </Section>
          <Section style={{ padding: "32px" }}>{children}</Section>
          <Hr style={{ borderColor: "#e5e7eb" }} />
          <Section style={{ padding: "16px 32px 32px" }}>
            <Text style={{ fontSize: 12, color: "#6b7280", lineHeight: "18px" }}>
              {f.auto}
              <br />
              <Link href={siteUrl} style={{ color: "#4f46e5" }}>
                {f.visit(siteName)}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const primaryButton = (lang: Lang): React.CSSProperties => ({
  backgroundColor: lang === "zh" ? "#111827" : "#4f46e5",
  color: "#ffffff",
  padding: "12px 32px",
  borderRadius: 6,
  textDecoration: "none",
  fontWeight: 600,
});

export function VerifyEmailEmail(props: BaseProps & { name: string; link: string }) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY.verify, lang);
  return (
    <EmailShell {...props} preview={c.preview(props.siteName)} lang={lang}>
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>{c.title}</Heading>
      <Text style={{ lineHeight: "24px" }}>{c.greet(props.name)}</Text>
      <Text style={{ lineHeight: "24px" }}>{c.body(props.siteName)}</Text>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Button href={props.link} style={primaryButton(lang)}>
          {c.cta}
        </Button>
      </Section>
      <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>
        {c.fallback}
        <br />
        <Link href={props.link} style={{ color: "#4f46e5", wordBreak: "break-all" }}>
          {props.link}
        </Link>
      </Text>
      <Text style={{ fontSize: 13, color: "#6b7280" }}>{c.ignore}</Text>
    </EmailShell>
  );
}

export function ResetPasswordEmail(props: BaseProps & { name: string; link: string }) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY.reset, lang);
  return (
    <EmailShell {...props} preview={c.preview} lang={lang}>
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>{c.title}</Heading>
      <Text style={{ lineHeight: "24px" }}>{c.greet(props.name)}</Text>
      <Text style={{ lineHeight: "24px" }}>{c.body}</Text>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Button href={props.link} style={primaryButton(lang)}>
          {c.cta}
        </Button>
      </Section>
      <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>
        {c.fallback}
        <br />
        <Link href={props.link} style={{ color: "#4f46e5", wordBreak: "break-all" }}>
          {props.link}
        </Link>
      </Text>
      <Text style={{ fontSize: 13, color: "#6b7280" }}>{c.ignore}</Text>
    </EmailShell>
  );
}

export function OrderConfirmedEmail(
  props: BaseProps & {
    name: string;
    orderNumber: string;
    total: string;
    items: { name: string; quantity: number }[];
    orderUrl: string;
  },
) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY.orderConfirmed, lang);
  return (
    <EmailShell {...props} preview={c.preview(props.orderNumber)} lang={lang}>
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>{c.title}</Heading>
      <Text style={{ lineHeight: "24px" }}>{c.greet(props.name)}</Text>
      <Text
        style={{ lineHeight: "24px" }}
        dangerouslySetInnerHTML={{ __html: c.body(props.orderNumber) }}
      />
      <Section
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: 6,
          padding: "16px 24px",
          margin: "16px 0",
        }}
      >
        {props.items.map((item) => (
          <Row key={item.name}>
            <Column>
              <Text style={{ margin: "4px 0", lineHeight: "22px" }}>
                {item.name} × {item.quantity}
              </Text>
            </Column>
          </Row>
        ))}
        <Hr style={{ borderColor: "#e5e7eb" }} />
        <Row>
          <Column>
            <Text style={{ margin: 0, fontWeight: 700 }}>{c.total}</Text>
          </Column>
          <Column>
            <Text style={{ margin: 0, textAlign: "right", fontWeight: 700 }}>{props.total}</Text>
          </Column>
        </Row>
      </Section>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Button href={props.orderUrl} style={primaryButton(lang)}>
          {c.cta}
        </Button>
      </Section>
    </EmailShell>
  );
}

export function OrderShippedEmail(
  props: BaseProps & {
    name: string;
    orderNumber: string;
    trackingCompany: string;
    trackingNumber: string;
    orderUrl: string;
  },
) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY.orderShipped, lang);
  return (
    <EmailShell {...props} preview={c.preview(props.orderNumber)} lang={lang}>
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>{c.title}</Heading>
      <Text style={{ lineHeight: "24px" }}>{c.greet(props.name)}</Text>
      <Text
        style={{ lineHeight: "24px" }}
        dangerouslySetInnerHTML={{ __html: c.body(props.orderNumber) }}
      />
      <Section
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: 6,
          padding: "16px 24px",
          margin: "16px 0",
        }}
      >
        <Text style={{ margin: "4px 0" }}>
          {c.carrier}: <strong>{props.trackingCompany || "-"}</strong>
        </Text>
        <Text style={{ margin: "4px 0" }}>
          {c.tracking}: <strong>{props.trackingNumber || "-"}</strong>
        </Text>
      </Section>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Button href={props.orderUrl} style={primaryButton(lang)}>
          {c.cta}
        </Button>
      </Section>
    </EmailShell>
  );
}

export function RefundUpdateEmail(
  props: BaseProps & {
    name: string;
    orderNumber: string;
    statusText: string;
    amount: string;
    note?: string;
    orderUrl: string;
  },
) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY.refundUpdate, lang);
  return (
    <EmailShell {...props} preview={c.preview(props.orderNumber)} lang={lang}>
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>{c.title}</Heading>
      <Text style={{ lineHeight: "24px" }}>{c.greet(props.name)}</Text>
      <Text
        style={{ lineHeight: "24px" }}
        dangerouslySetInnerHTML={{ __html: c.body(props.orderNumber) }}
      />
      <Text style={{ lineHeight: "24px" }}>
        <strong>{props.statusText}</strong>
      </Text>
      <Text style={{ lineHeight: "24px" }}>
        {c.amount}: {props.amount}
      </Text>
      {props.note ? (
        <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>
          {c.note}: {props.note}
        </Text>
      ) : null}
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Button href={props.orderUrl} style={primaryButton(lang)}>
          {c.cta}
        </Button>
      </Section>
    </EmailShell>
  );
}

export function DataDeletionEmail(props: BaseProps & { name: string }) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY.dataDeletion, lang);
  return (
    <EmailShell {...props} preview={c.preview} lang={lang}>
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>{c.title}</Heading>
      <Text style={{ lineHeight: "24px" }}>{c.greet(props.name)}</Text>
      <Text style={{ lineHeight: "24px" }} dangerouslySetInnerHTML={{ __html: c.body }} />
      <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>
        {c.note}{" "}
        <Link href={c.link(props.siteUrl)} style={{ color: "#4f46e5" }}>
          {c.link(props.siteUrl)}
        </Link>
        {lang === "zh" ? c.suffix : ""}
      </Text>
    </EmailShell>
  );
}

/** 注销处理完成通知（admin 确认注销后、匿名化前发往原邮箱） */
export function AccountDeletedEmail(props: BaseProps & { name: string }) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY.accountDeleted, lang);
  return (
    <EmailShell {...props} preview={c.preview} lang={lang}>
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>{c.title}</Heading>
      <Text style={{ lineHeight: "24px" }}>{c.greet()}</Text>
      <Text style={{ lineHeight: "24px" }}>{c.body}</Text>
      <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>{c.note}</Text>
      <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>{c.hint}</Text>
    </EmailShell>
  );
}

/** 注销申请驳回通知（admin 驳回后发给用户，note 为客服备注可选） */
export function DeletionRejectedEmail(props: BaseProps & { name: string; note?: string }) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY.deletionRejected, lang);
  return (
    <EmailShell {...props} preview={c.preview} lang={lang}>
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>{c.title}</Heading>
      <Text style={{ lineHeight: "24px" }}>{c.greet(props.name)}</Text>
      <Text style={{ lineHeight: "24px" }}>{c.body}</Text>
      {props.note ? (
        <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>
          {c.noteLabel} {props.note}
        </Text>
      ) : null}
      <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>{c.hint}</Text>
    </EmailShell>
  );
}

export function RestockEmail(
  props: BaseProps & {
    name: string;
    productName: string;
    /** 客户登记时选择的规格，如 "Color: Black / Size: M"；未选则为空 */
    variantText?: string;
    /** 商品卡：首图（绝对 URL）与卖点节选 */
    image?: string;
    excerpt?: string;
    priceText: string;
    compareAtText?: string;
    productUrl: string;
    /** 预售商品开售（商品配置了预售提示文案）→ 文案切换为「预购开售」口径 */
    isPresale?: boolean;
  },
) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY.restock, lang);
  return (
    <EmailShell
      {...props}
      preview={props.isPresale ? c.presaleTitle : c.preview(props.productName)}
      lang={lang}
    >
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>
        {props.isPresale ? c.presaleTitle : c.title}
      </Heading>
      <Text style={{ lineHeight: "24px" }}>{c.greet(props.name)}</Text>
      <Text style={{ lineHeight: "24px" }}>{props.isPresale ? c.presaleBody : c.body}</Text>

      {/* 商品卡片：图 + 名 + 卖点 + 规格 + 价格 + 紧迫提示 + CTA（到货提醒即广告） */}
      <Section
        style={{
          margin: "18px auto",
          maxWidth: "420px",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {props.image ? (
          <Img
            src={props.image}
            alt={props.productName}
            width={420}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        ) : null}
        <div style={{ padding: "16px 18px 18px" }}>
          <Text
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "#111827",
              lineHeight: "24px",
              margin: "0 0 6px",
            }}
          >
            {props.productName}
          </Text>
          {props.excerpt ? (
            <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px", margin: "0 0 8px" }}>
              {props.excerpt}
            </Text>
          ) : null}
          {props.variantText ? (
            <Text style={{ fontSize: 13, color: "#374151", lineHeight: "20px", margin: "0 0 8px" }}>
              {c.variant}: <strong>{props.variantText}</strong>
            </Text>
          ) : null}
          <Text style={{ fontSize: 15, lineHeight: "22px", margin: "0 0 10px" }}>
            <strong>{props.priceText}</strong>
            {props.compareAtText ? (
              <span
                style={{
                  marginLeft: 8,
                  color: "#9ca3af",
                  textDecoration: "line-through",
                  fontSize: 13,
                }}
              >
                {props.compareAtText}
              </span>
            ) : null}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: "#b45309",
              lineHeight: "18px",
              margin: "0 0 14px",
              fontWeight: 600,
            }}
          >
            ⏳ {c.urgency}
          </Text>
          <Button href={props.productUrl} style={primaryButton(lang)}>
            {c.cta}
          </Button>
        </div>
      </Section>

      <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>{c.hint}</Text>
    </EmailShell>
  );
}

/**
 * 联系表单留言通知 —— 发给**站点运营者**（不是顾客）。
 *
 * 与其它模板的区别：收件人是内部运营，因此文案以运营侧习惯为准
 * （默认中文），并把顾客原文完整附上，方便直接回复。
 * 顾客填写的姓名/邮箱/正文一律原样展示（已在上游做长度与格式校验）。
 */
export function ContactMessageEmail(
  props: BaseProps & { name: string; email: string; message: string; source: string },
) {
  const lang: Lang = props.lang ?? "zh";
  const zh = lang === "zh";
  return (
    <EmailShell
      {...props}
      preview={zh ? "收到一条新的联系表单留言" : "New contact form message"}
      lang={lang}
    >
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>
        {zh ? "新的联系表单留言" : "New contact form message"}
      </Heading>
      <Text style={{ lineHeight: "24px" }}>
        <strong>{zh ? "姓名" : "Name"}</strong>：{props.name}
        <br />
        <strong>{zh ? "邮箱" : "E-mail"}</strong>：{props.email}
        <br />
        <strong>{zh ? "来源" : "Source"}</strong>：{props.source}
      </Text>
      <Hr style={{ borderColor: "#e5e7eb", margin: "16px 0" }} />
      <Text style={{ lineHeight: "24px", whiteSpace: "pre-wrap" }}>{props.message}</Text>
      <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>
        {zh
          ? "直接回复本邮件即可联系到对方；留言同时已存入后台「联系留言」。"
          : "Reply to this email to reach the sender. The message is also stored in the admin inbox."}
      </Text>
    </EmailShell>
  );
}
