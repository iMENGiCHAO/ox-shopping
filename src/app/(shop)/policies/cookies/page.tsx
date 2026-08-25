import type { Metadata } from "next";
import { PolicyPage } from "@/components/shop/policy-page";
import { ResetConsentButton } from "@/components/shop/reset-consent-button";
import { renderPolicyMarkdown } from "@/components/shop/policy-render";
import { getSiteSettings, getPolicyText } from "@/server/services/settings.service";
import { getLang, getT } from "@/lib/shop-i18n-server";
import { POLICY_TITLES } from "@/lib/policy-defaults";

export async function generateMetadata(): Promise<Metadata> {
  const t = getT();
  const lang = getLang();
  return {
    title: lang === "zh" ? POLICY_TITLES.cookies.zh : POLICY_TITLES.cookies.en,
    description: t("Cookie Policy: How we use cookies and similar technologies"),
  };
}

export default async function CookiesPolicyPage() {
  const settings = await getSiteSettings();
  const t = getT();
  const lang = getLang();
  return (
    <PolicyPage title={t("Cookie Policy")} updatedAt={t("As last published")}>
      {renderPolicyMarkdown(getPolicyText(settings.policies, "cookies", lang))}
      <div className="pt-2">
        <ResetConsentButton />
      </div>
    </PolicyPage>
  );
}
