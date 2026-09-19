import type { Metadata } from "next";
import { getT } from "@/lib/shop-i18n-server";
import { ContactForm } from "@/components/shop/contact-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Contact Us") };
}

/**
 * /pages/contact —— 对齐原站（2026-09-19 用 WebFetch 直读复核）：
 *   - 标题 `Contact Us`
 *   - 三个字段 **Name / E-mail / Message**（顺序与字段名逐字一致）
 *   - 提交按钮 `Send message`
 *
 * 原站 FAQ 页第一条答案里就引用了这个页面（「or fill out this form」），
 * 此前本地缺这一页 → 补上，避免 FAQ 指向一个不存在的地址。
 */
export default async function ContactPage() {
  const t = await getT();
  return (
    <div className="content-shell pb-16 pt-[var(--faq-head-pt)]">
      <h1 className="text-center text-[28px] font-normal leading-tight text-foreground">
        {t("Contact Us")}
      </h1>
      <div className="mx-auto mt-[var(--faq-head-gap)] w-full max-w-[440px]">
        <ContactForm />
      </div>
    </div>
  );
}
