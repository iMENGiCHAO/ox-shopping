import type { Metadata } from "next";
import { PolicyPage } from "@/components/shop/policy-page";
import { renderPolicyMarkdown } from "@/components/shop/policy-render";
import { getSiteSettings, getPolicyText } from "@/server/services/settings.service";
import { getLang, getT } from "@/lib/shop-i18n-server";
import { POLICY_TITLES } from "@/lib/policy-defaults";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const lang = await getLang();
  return {
    title: lang === "zh" ? POLICY_TITLES.terms.zh : POLICY_TITLES.terms.en,
    description: t("Terms of Service: please read and agree before using our service"),
  };
}

export default async function TermsPolicyPage() {
  const settings = await getSiteSettings();
  const t = await getT();
  const lang = await getLang();
  return (
    <PolicyPage title={t("Terms and Conditions")} updatedAt={t("As last published")}>
      {renderPolicyMarkdown(getPolicyText(settings.policies, "terms", lang))}
    </PolicyPage>
  );
}
