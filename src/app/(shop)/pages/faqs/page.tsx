import type { Metadata } from "next";
import { getT } from "@/lib/shop-i18n-server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = getT();
  return { title: t("FAQs · Frequently Asked Questions") };
}

interface QA {
  q: string;
  a: string;
}

/** DB 无数据时的兜底内容（与初始种子一致） */
const FALLBACK_FAQS: QA[] = [
  {
    q: "Shipping times",
    a: "In-stock items ship within 48 hours of payment, excluding public holidays. Pre-order items ship within 14 days after the pre-sale period shown on their product page ends (by default, within 14 days of payment). Once your order ships, you'll receive an SMS and email notification with the tracking number.",
  },
  {
    q: "How do I track my order?",
    a: "Sign in and go to “My Orders” — click the order to see its delivery status and carrier information. If you checked out without an account, you can track it via the link in your order confirmation email.",
  },
];

const FALLBACK_CONTACT = {
  heading: "Contact us",
  body: "Questions about an order, a product, or wholesale? Send us a message and our team will reply within one business day.",
  email: "support@example.com",
};

async function loadFaqs(): Promise<QA[]> {
  try {
    const rows = await prisma.faq.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { question: true, answer: true },
    });
    if (rows.length > 0) return rows.map((r) => ({ q: r.question, a: r.answer }));
  } catch {
    /* 数据库不可用时退回兜底 */
  }
  return FALLBACK_FAQS;
}

async function loadContact() {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: "contact_content" } });
    if (row?.value && typeof row.value === "object") {
      const v = row.value as Record<string, unknown>;
      return {
        heading: typeof v.heading === "string" ? v.heading : FALLBACK_CONTACT.heading,
        body: typeof v.body === "string" ? v.body : FALLBACK_CONTACT.body,
        email: typeof v.email === "string" ? v.email : FALLBACK_CONTACT.email,
      };
    }
  } catch {
    /* ignore */
  }
  return FALLBACK_CONTACT;
}

/** /pages/faqs — FAQ 内容页（后台「FAQ 管理」实时维护 + 底部联系我们板块） */
export default async function FaqsPage() {
  const t = getT();
  const [faqs, contact] = await Promise.all([loadFaqs(), loadContact()]);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h1 className="text-center text-[28px] font-normal leading-tight text-foreground">
        {t("FAQs · Frequently Asked Questions")}
      </h1>

      <div className="mt-10 divide-y divide-border border-y border-border">
        {faqs.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-normal text-foreground transition-opacity hover:opacity-70 [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="shrink-0 text-xl leading-none opacity-50 transition-transform duration-200 group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-foreground/75">{f.a}</p>
          </details>
        ))}
      </div>

      {/* 联系我们 — 后台可编辑板块 */}
      <div className="mt-12 border border-border p-6 text-center">
        <h2 className="text-[18px] font-normal text-foreground">{contact.heading || t("Contact us")}</h2>
        {contact.body ? (
          <p className="mx-auto mt-3 max-w-[480px] text-[13px] leading-relaxed text-foreground/70">{contact.body}</p>
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
    </div>
  );
}
