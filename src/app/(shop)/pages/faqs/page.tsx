import { Fragment } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/server/services/settings.service";
import { FAQ_DEFAULTS } from "@/lib/faq-defaults";
import { localizePath, type Lang } from "@/lib/shop-i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // 原站标题就是 `FAQs`（字形 y138..160，28px）——不带任何后缀
  return { title: t("FAQs") };
}

interface QA {
  q: string;
  a: string;
}

/**
 * 读取已发布的 FAQ（后台「FAQ 管理」维护）。
 * 双语字段语义与 Product.name/nameEn 一致：
 *   - zh → question / answer
 *   - en → questionEn / answerEn，缺省回落中文（不出现空白条目）
 * 数据库无数据时回落 `FAQ_DEFAULTS`（10 条，覆盖原站 FAQ 的全部主题）。
 */
async function loadFaqs(lang: Lang): Promise<QA[]> {
  const pick = (zh: string, en: string | null) => (lang === "en" ? en || zh : zh);
  try {
    const rows = await prisma.faq.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { question: true, answer: true, questionEn: true, answerEn: true },
    });
    if (rows.length > 0) {
      return rows.map((r) => ({
        q: pick(r.question, r.questionEn),
        a: pick(r.answer, r.answerEn),
      }));
    }
  } catch {
    /* 数据库不可用时退回兜底 */
  }
  return FAQ_DEFAULTS.map((f) => ({
    q: lang === "en" ? f.questionEn : f.question,
    a: lang === "en" ? f.answerEn : f.answer,
  }));
}

/**
 * 联系我们板块（后台可编辑）—— 仅当管理员**显式保存过** `contact_content`
 * 时才渲染。原站 FAQ 页没有联系卡片，默认不显示可保持样式一致；
 * 运营需要在页尾加联系入口时，在后台「FAQ 与联系我们」填好即会出现。
 */
async function loadContact() {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: "contact_content" } });
    if (row?.value && typeof row.value === "object") {
      const v = row.value as Record<string, unknown>;
      const heading = typeof v.heading === "string" ? v.heading.trim() : "";
      const body = typeof v.body === "string" ? v.body.trim() : "";
      const email = typeof v.email === "string" ? v.email.trim() : "";
      if (heading || body || email) return { heading, body, email };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * FAQ 答案里的占位符 → 渲染片段的唯一解析口。
 *
 * 原站原文：“For general questions regarding merchandise, you can email us at
 * merch@shop.x.com or fill out [this form](/pages/contact).”
 * 本地文案因此用两个占位符表达，**文案里不写死邮箱、也不写死链接**：
 *   - `{supportEmail}` → 后台「客服邮箱」配置值（纯文本，与原站一致，不加下划线）
 *   - `{contactForm}`  → 指向 `/pages/contact` 的站内链接
 *
 * 解析结果供两处消费：
 *   - JSX 正文：文本节点 / `<Link>` 交替
 *   - JSON-LD（FAQPage 结构化数据）：只需纯文本，见 `toPlain()`
 */
type FaqSegment = { kind: "text"; value: string } | { kind: "link"; path: string; label: string };

const FAQ_TOKEN_RE = /(\{supportEmail\}|\{contactForm\})/g;

function toSegments(text: string, supportEmail: string, formLabel: string): FaqSegment[] {
  const out: FaqSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(FAQ_TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", value: text.slice(last, at) });
    out.push(
      m[0] === "{supportEmail}"
        ? { kind: "text", value: supportEmail }
        : { kind: "link", path: "/pages/contact", label: formLabel },
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

/** JSON-LD 用：把占位符拍平成纯文本（链接取锚文本） */
function toPlain(text: string, supportEmail: string, formLabel: string): string {
  return text.replaceAll("{supportEmail}", supportEmail).replaceAll("{contactForm}", formLabel);
}

/**
 * /pages/faqs —— 与 shop.x.com 同构（1200 视口逐像素实测）：
 *   - `<h1>FAQs</h1>` 28px **居中**，字形顶 y=138
 *   - 正文列 **679px**（容器 720px + 20px 内边距）
 *   - 内容形态为「**加粗问题段 + 散文答案段**」交替，**无手风琴、无联系卡片**
 *   - 段内行距 25px、段间距 20px（原站实测字形间距 32px）
 *   - 答案里的 `{supportEmail}` / `{contactForm}` 在渲染期替换，文案不写死
 */
export default async function FaqsPage() {
  const t = await getT();
  const lang = await getLang();
  const settings = await getSiteSettings();
  const [faqs, contact] = await Promise.all([loadFaqs(lang), loadContact()]);

  const supportEmail = settings.contactEmail;
  const formLabel = t("this form");
  const plain = (s: string) => toPlain(s, supportEmail, formLabel);
  const seg = (s: string) => toSegments(s, supportEmail, formLabel);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: plain(f.q),
      acceptedAnswer: { "@type": "Answer", text: plain(f.a) },
    })),
  };

  return (
    <div className="content-shell pb-16 pt-[var(--faq-head-pt)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h1 className="text-center text-[28px] font-normal leading-tight text-foreground">
        {t("FAQs")}
      </h1>

      <div className="prose-page mt-[var(--faq-head-gap)]">
        {faqs.map((f, i) => (
          <Fragment key={`${i}-${f.q}`}>
            <p>
              <strong>{plain(f.q)}</strong>
            </p>
            <p>
              {seg(f.a).map((s, j) =>
                s.kind === "text" ? (
                  <Fragment key={j}>{s.value}</Fragment>
                ) : (
                  <Link
                    key={j}
                    href={localizePath(s.path, lang)}
                    className="link-underline text-foreground"
                  >
                    {s.label}
                  </Link>
                ),
              )}
            </p>
          </Fragment>
        ))}
      </div>

      {contact ? (
        <div className="mt-12 border border-border p-6 text-center">
          {contact.heading ? (
            <h2 className="text-[18px] font-normal text-foreground">{contact.heading}</h2>
          ) : null}
          {contact.body ? (
            <p className="mx-auto mt-3 max-w-[480px] text-[13px] leading-relaxed text-foreground/70">
              {contact.body}
            </p>
          ) : null}
          {contact.email ? (
            <p className="mt-3 text-[13px] text-foreground/70">
              {t("Email")}:{" "}
              <a href={`mailto:${contact.email}`} className="link-underline text-foreground">
                {contact.email}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
