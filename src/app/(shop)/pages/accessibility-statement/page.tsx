import type { Metadata } from "next";
import { PolicyPage } from "@/components/shop/policy-page";
import { renderPolicyMarkdown } from "@/components/shop/policy-render";
import { getSiteSettings, getPolicyText } from "@/server/services/settings.service";
import { getLang, getT } from "@/lib/shop-i18n-server";
import { POLICY_TITLES } from "@/lib/policy-defaults";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title:
      lang === "zh" ? POLICY_TITLES.accessibility.zh : POLICY_TITLES.accessibility.en,
    description: "Accessibility Statement",
  };
}

/**
 * Accessibility statement — 后台「法务页面 → 无障碍声明」可直接维护，
 * 无自定义内容时回落内置默认文案（与其它政策页同一套 getPolicyText 机制）。
 */
export default async function AccessibilityPage() {
  const settings = await getSiteSettings();
  const t = await getT();
  const lang = await getLang();
  return (
    <PolicyPage title={t("Accessibility Statement")} updatedAt={t("As last published")}>
      {renderPolicyMarkdown(getPolicyText(settings.policies, "accessibility", lang))}
    </PolicyPage>
  );
}