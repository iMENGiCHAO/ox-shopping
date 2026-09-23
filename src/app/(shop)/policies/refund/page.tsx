import type { Metadata } from "next";
import { PolicyPage } from "@/components/shop/policy-page";
import { renderPolicyMarkdown } from "@/components/shop/policy-render";
import { getSiteSettings, getPolicyText } from "@/server/services/settings.service";
import { getLang, getT } from "@/lib/shop-i18n-server";
import { POLICY_TITLES } from "@/lib/policy-defaults";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: lang === "zh" ? POLICY_TITLES.refund.zh : POLICY_TITLES.refund.en,
    description:
      lang === "zh"
        ? "退款政策：适用范围、申请条件、处理时间与退货支持说明"
        : "Refund Policy: eligibility, conditions, processing times, and return support",
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
