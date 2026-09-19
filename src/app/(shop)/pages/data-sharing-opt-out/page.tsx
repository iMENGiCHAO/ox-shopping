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
      lang === "zh"
        ? POLICY_TITLES.dataSharingOptOut.zh
        : POLICY_TITLES.dataSharingOptOut.en,
    description:
      "Opt out of the sale or sharing of your personal information for targeted advertising.",
  };
}

/**
 * /pages/data-sharing-opt-out —— 原站页脚 `Your Privacy Choices` 的落地页。
 *
 * 文案由后台「法务页面 → 您的隐私选择」维护（getPolicyText 机制，与其它政策页一致），
 * 未配置时回落内置默认。页尾额外渲染一个真实的 **mailto 行动按钮**，
 * 使用后台配置的客服邮箱 —— 原站该页只有说明文字、没有可执行入口，
 * 这里补上是为了让「选择退出」真正可操作（商用合规要求请求渠道可达）。
 */
export default async function DataSharingOptOutPage() {
  const settings = await getSiteSettings();
  const t = await getT();
  const lang = await getLang();
  const supportEmail = settings.contactEmail;

  return (
    <PolicyPage
      title={t("Your Privacy Choices")}
      updatedAt={t("As last published")}
      footer={
        supportEmail ? (
          <div className="border-t border-border pt-6">
            <a
              href={`mailto:${supportEmail}?subject=${encodeURIComponent(
                "Do Not Sell or Share My Personal Information",
              )}`}
              className="btn-sweep inline-flex h-[46px] items-center border border-primary px-[26px] text-[14px] font-normal text-foreground"
            >
              {t("Your Privacy Choices")}
            </a>
            <p className="mt-3 text-[13px] text-foreground/60">
              {t("Email")}:{" "}
              <a href={`mailto:${supportEmail}`} className="link-underline text-foreground">
                {supportEmail}
              </a>
            </p>
          </div>
        ) : null
      }
    >
      {renderPolicyMarkdown(getPolicyText(settings.policies, "dataSharingOptOut", lang))}
    </PolicyPage>
  );
}
