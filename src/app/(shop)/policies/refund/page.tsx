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
    title: lang === "zh" ? POLICY_TITLES.refund.zh : POLICY_TITLES.refund.en,
    description: t("Refund Policy: 7-day no-reason returns, refund conditions, and process"),
  };
}

export default async function RefundPolicyPage() {
  const settings = await getSiteSettings();
  const t = await getT();
  const lang = await getLang();
  return (
    <PolicyPage title={t("Refund Policy")} updatedAt={t("As last published")}>
      {renderPolicyMarkdown(getPolicyText(settings.policies, "refund", lang))}
    </PolicyPage>
  );
}
