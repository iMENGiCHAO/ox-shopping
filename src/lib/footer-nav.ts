/**
 * 页脚链接 —— 单一事实来源（sitemap / 页脚 / 无障碍导航共用）。
 *
 * 标签、顺序与 `href` 逐字对齐 shop.x.com 页脚实测（Playwright 直连原站导出的
 * footer 全部 <a>，2026-09-20 复核）：`FAQs · Search · Accessibility Statement ·
 * Privacy Policy · Terms and Conditions · Cookie Consent` —— **共 6 条**。
 *
 * 关键实测差异（一律以原站为准）：
 * - 原站**没有** `Your Privacy Choices` 第 7 条（此前本地多出一条，已移除）。
 * - 隐私政策按大爷要求走**站内可编辑页**（原站是外链 x.com，此处刻意不同）。
 * - 原站 `Cookie Consent` 指向 `https://shop.x.com/?preview_privacy_banner=1`，
 *   即**重新唤起 cookie 同意横幅**，不是站内政策页。
 * - 原站 `Terms and Conditions` 路径是 `/pages/terms-and-conditions`。
 * - 原站页脚**没有** `Refund Policy`（本项目的 `/policies/refund` 页面保留，
 *   售后与结账页脚仍需要，只是不进店铺页脚）。
 *
 * `labelKey` 是 shop-i18n 的键（英文源串），中英各一份；
 * `external` 为真时渲染成 `<a target="_blank" rel="noopener noreferrer">`。
 */
export interface FooterLink {
  href: string;
  labelKey: string;
  external?: boolean;
  /** 用原生 <a> 全页导航（而非 next/link 软导航）：需要目标页重新挂载时使用，
   *  如 Cookie Consent 的 ?preview_privacy_banner=1 要靠挂载读取 query 重开横幅 */
  hard?: boolean;
}

export const FOOTER_LINKS: readonly FooterLink[] = [
  { href: "/pages/faqs", labelKey: "FAQs" },
  { href: "/search", labelKey: "Search" },
  { href: "/pages/accessibility-statement", labelKey: "Accessibility Statement" },
  // 隐私政策用**站内页**（大爷 2026-09-20 明确：不要外链，要后台可编辑内容）。
  // 内容取自 SiteSetting.policies.privacy，可在 admin/legal 双语编辑。
  { href: "/policies/privacy", labelKey: "Privacy Policy" },
  { href: "/pages/terms-and-conditions", labelKey: "Terms and Conditions" },
  // 原站点是「重新唤起同意横幅」而非政策页：查询参数 + 原生 <a> 全页导航，
  // 让横幅组件重新挂载并读到该参数
  { href: "/?preview_privacy_banner=1", labelKey: "Cookie Consent", hard: true },
] as const;
