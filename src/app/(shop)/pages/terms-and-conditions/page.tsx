import type { Metadata } from "next";
import { PolicyPage } from "@/components/shop/policy-page";
import { renderPolicyMarkdown } from "@/components/shop/policy-render";
import { getSiteSettings, getPolicyText } from "@/server/services/settings.service";
import { getLang, getT } from "@/lib/shop-i18n-server";
import { POLICY_TITLES } from "@/lib/policy-defaults";

/**
 * 服务条款页 —— 路径逐字对齐原站 shop.x.com 实测：
 * 原站 `/pages/terms-and-conditions` 返回 200，而 `/policies/terms` 是 404。
 * 页脚「Terms and Conditions」入口由此路径承载（内容仍取自后台可编辑的
 * SiteSetting.policies.terms，中英双语）。
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const lang = await getLang();
  return {
    title: lang === "zh" ? POLICY_TITLES.terms.zh : POLICY_TITLES.terms.en,
    description: t("Terms of Service: please read and agree before using our service"),
  };
}

export default async function TermsAndConditionsPage() {
  const settings = await getSiteSettings();
  const t = await getT();
  const lang = await getLang();
  return (
    <PolicyPage title={t("Terms of Service")} updatedAt={t("As last published")}>
      {renderPolicyMarkdown(getPolicyText(settings.policies, "terms", lang))}
    </PolicyPage>
  );
}
