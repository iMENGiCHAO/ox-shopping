import type { Metadata } from "next";
import { PolicyPage } from "@/components/shop/policy-page";
import { renderPolicyMarkdown } from "@/components/shop/policy-render";
import { getSiteSettings, getPolicyText } from "@/server/services/settings.service";
import { getLang, getT } from "@/lib/shop-i18n-server";
import { POLICY_TITLES } from "@/lib/policy-defaults";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const lang = await getLang();
  const titleEn = POLICY_TITLES.privacy.en;
  return {
    title: lang === "zh" ? POLICY_TITLES.privacy.zh : titleEn,
    description: t("Privacy Policy: How we collect, use, and protect your personal data"),
  };
}

export default async function PrivacyPolicyPage() {
  const settings = await getSiteSettings();
  const t = await getT();
  const lang = await getLang();
  return (
    <PolicyPage title={t("Privacy Policy")} updatedAt={t("As last published")}>
      {renderPolicyMarkdown(getPolicyText(settings.policies, "privacy", lang))}
    </PolicyPage>
  );
}
