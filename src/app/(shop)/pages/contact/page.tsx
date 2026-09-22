import type { Metadata } from "next";
import { getT } from "@/lib/shop-i18n-server";
import { ContactForm } from "@/components/shop/contact-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // 原站实测：`<title>` 是 **`Contact`**（比 H1 的 `Contact Us` 短）
  return { title: t("Contact") };
}

/**
 * /pages/contact —— 对齐原站（2026-09-20 用 Playwright 直连复核）：
 *   - `<title>` = `Contact`
 *   - H1 = `Contact Us`，**居中、计算字号 26.5639px、行盒 37px、位于 y=129**
 *     （与搜索页 / 内容页标题同一档；本地此前是 28px @y=128）
 *   - 三个字段 **Name / E-mail / Message**（顺序与字段名逐字一致，且带同名 placeholder）
 *   - 提交按钮 `Send message`
 *
 * 原站 FAQ 页第一条答案里就引用了这个页面（「or fill out this form」），
 * 此前本地缺这一页 → 补上，避免 FAQ 指向一个不存在的地址。
 *
 * ⚠️ **尚未对齐**：原站表单是「**label 在左列、输入框在右列**、整幅 680 宽」
 * （输入框 x=616 宽 332、Message 满宽 680、提交按钮满宽 680×46、输入框高 48），
 * 本地目前是「label 在上、440 窄列居中」。原站取证到一半被限流
 * （`ERR_CONNECTION_CLOSED`），待原站可访问后再按实测重排。
 */
export default async function ContactPage() {
  const t = await getT();
  return (
    <div className="content-shell pb-16 pt-[var(--page-title-pt)]">
      <h1 className="text-center text-[length:var(--page-title-size)] font-normal leading-[37px] text-foreground">
        {t("Contact Us")}
      </h1>
      <div className="mx-auto mt-[var(--faq-head-gap)] w-full max-w-[440px]">
        <ContactForm />
      </div>
    </div>
  );
}
