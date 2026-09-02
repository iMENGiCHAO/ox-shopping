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
      body: "我们已收到您的账户数据删除请求，将在 <strong>30 个自然日内</strong>完成处理。处理完成后，您的账户及关联数据将被永久删除。",
      note: "如需撤回该请求，请尽快联系客服：",
      link: (u: string) => `${u}/policies/contact`,
      suffix: "或回复本邮件地址。",
    },
    en: {
      preview: "Data deletion request received",
      title: "Data deletion request received",
      greet: (n: string) => `Hi ${n},`,
      body: "We have received your account data deletion request and will process it within <strong>30 calendar days</strong>. Once completed, your account and associated data will be permanently deleted.",
      note: "To withdraw this request, please contact customer support as soon as possible:",
      link: (u: string) => `${u}/policies/contact`,
      suffix: "Or reply to this email.",
    },
  },
  restock: {
    zh: {
      preview: (p: string) => `您关注的「${p}」已现货回归`,
      title: "您关注的商品到货啦",
      greet: (n: string) => `您好，${n}：`,
      body: "您登记到货通知的商品已有现货，数量有限，先到先得：",
      variant: "您关注的规格",
      cta: "立即购买",
      hint: "此提醒来自您曾登记的到货通知，如不想再收到可忽略本邮件。",
    },
    en: {
      preview: (p: string) => `${p} is back in stock`,
      title: "Back in stock — the item you wanted is here",
      greet: (n: string) => `Hi ${n},`,
      body: "Good news — the item you signed up for is back in stock. Limited quantity, first come first served:",
      variant: "Variant you asked about",
      cta: "Shop now",
      hint: "You're receiving this because you signed up for a restock notification. Ignore this email if you no longer want updates.",
    },
  },
  "price-drop": {
    zh: {
      preview: (p: string) => `「${p}」降价了，现在购买正当时`,
      title: "您关注的商品降价了",
      greet: (n: string) => `您好，${n}：`,
      body: "您订阅降价提醒的商品已降价。机会难得，尽快入手：",
      cta: "立即购买",
      hint: "此提醒来自您曾登记的降价通知。如不想再收到此类邮件，可点击下方取消订阅。",
    },
    en: {
      preview: (p: string) => `${p} just got cheaper`,
      title: "Price drop on the item you wanted",
      greet: (n: string) => `Hi ${n},`,
      body: "Good news — an item you subscribed to is now cheaper. Limited time:",
      cta: "Shop now",
      hint: "You're receiving this because you signed up for a price-drop alert. Unsubscribe below if you no longer want these emails.",
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
  },
) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY.restock, lang);
  return (
    <EmailShell {...props} preview={c.preview(props.productName)} lang={lang}>
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>{c.title}</Heading>
      <Text style={{ lineHeight: "24px" }}>{c.greet(props.name)}</Text>
      <Text style={{ lineHeight: "24px" }}>{c.body}</Text>

      {/* 商品卡片：图 + 名 + 卖点 + 规格 + 价格 + CTA（到货提醒即广告） */}
      <Section style={{ margin: "18px 0", border: "1px solid #e5e7eb" }}>
        {props.image ? (
          <Img
            src={props.image}
            alt={props.productName}
            style={{
              width: "100%",
              height: "auto",
              maxHeight: "320px",
              objectFit: "cover",
              display: "block",
            }}
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
          <Text style={{ fontSize: 15, lineHeight: "22px", margin: "0 0 14px" }}>
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
          <Button href={props.productUrl} style={primaryButton(lang)}>
            {c.cta}
          </Button>
        </div>
      </Section>

      <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>{c.hint}</Text>
    </EmailShell>
  );
}

/** 降价通知邮件（订阅降价提醒的商品价格下降时触发） */
export function PriceDropEmail(
  props: BaseProps & {
    productName: string;
    image?: string;
    /** 原价（划线价） */
    oldPrice: string;
    /** 新价（突出） */
    newPrice: string;
    currency: string;
    /** 降价百分比（整数 %） */
    percent: number;
    productUrl: string;
    /** 取消订阅 URL（可选） */
    unsubscribeUrl?: string;
  },
) {
  const lang: Lang = props.lang ?? "zh";
  const c = pick(COPY["price-drop"], lang);
  return (
    <EmailShell {...props} preview={c.preview(props.productName)} lang={lang}>
      <Heading style={{ fontSize: 22, margin: "0 0 16px" }}>{c.title}</Heading>
      {/* greet 接收 "客户" 即可，这里用通用问候 */}
      <Text style={{ lineHeight: "24px" }}>{c.greet(lang === "zh" ? "顾客" : "Customer")}</Text>
      <Text style={{ lineHeight: "24px" }}>{c.body}</Text>

      <Section style={{ margin: "18px 0", border: "1px solid #e5e7eb" }}>
        {props.image ? (
          <Img
            src={props.image}
            alt={props.productName}
            style={{
              width: "100%",
              height: "auto",
              maxHeight: "320px",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : null}
        <div style={{ padding: "16px 18px 18px" }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#111827",
              lineHeight: "22px",
              margin: "0 0 8px",
            }}
          >
            {props.productName}
          </Text>
          <Text style={{ fontSize: 15, lineHeight: "22px", margin: "0 0 14px" }}>
            <strong style={{ color: "#dc2626", fontSize: 22 }}>
              {props.currency} {props.newPrice}
            </strong>
            <span
              style={{
                marginLeft: 8,
                color: "#9ca3af",
                textDecoration: "line-through",
                fontSize: 14,
              }}
            >
              {props.currency} {props.oldPrice}
            </span>
            <span
              style={{
                marginLeft: 8,
                background: "#dc2626",
                color: "#fff",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              -{props.percent}%
            </span>
          </Text>
          <Button href={props.productUrl} style={primaryButton(lang)}>
            {c.cta}
          </Button>
        </div>
      </Section>

      <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: "20px" }}>{c.hint}</Text>
      {props.unsubscribeUrl ? (
        <Text style={{ fontSize: 12, color: "#9ca3af", margin: "12px 0 0" }}>
          <a href={props.unsubscribeUrl} style={{ color: "#9ca3af" }}>
            {lang === "zh" ? "取消订阅" : "Unsubscribe"}
          </a>
        </Text>
      ) : null}
    </EmailShell>
  );
}
