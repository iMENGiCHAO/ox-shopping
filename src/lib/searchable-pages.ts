/** Pages 检索注册表（官方 Pages 结果为 Shopify Pages；前台搜索页与顶栏联想共用） */
export interface SearchablePage {
  title: string;
  titleZh: string;
  href: string;
  keywords: string;
}

export const SEARCHABLE_PAGES: SearchablePage[] = [
  {
    title: "FAQs",
    titleZh: "常见问题",
    href: "/pages/faqs",
    keywords:
      "faq faqs 常见问题 帮助 帮助中心 shipping returns 发货 退货 物流 order tracking 订单 物流 支付 payment refund 退款 pre-order 预售 presale 预售 尺码 size chart 参数对照 尺寸",
  },
  {
    title: "Accessibility Statement",
    titleZh: "无障碍声明",
    href: "/pages/accessibility-statement",
    keywords: "accessibility wcag screen reader disability 无障碍 读屏 辅助 可访问性",
  },
  {
    title: "Privacy Policy",
    titleZh: "隐私政策",
    href: "/policies/privacy",
    keywords: "privacy 数据 个人信息 privacy policy 隐私政策 gdpr cookies 隐私",
  },
  {
    title: "Terms and Conditions",
    titleZh: "条款与条件",
    href: "/policies/terms",
    keywords: "terms 条款 conditions 服务条款 service legal agreement 协议 用户协议",
  },
  {
    title: "Cookie Consent",
    titleZh: "Cookie 同意",
    href: "/policies/cookies",
    keywords: "cookie consent 追踪 存储 cookie 同意 tracking storage 隐私",
  },
];

/** 页面命中：标题（中/英）子串或关键词（中/英）子串 */
export function matchSearchablePages(query: string): SearchablePage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SEARCHABLE_PAGES.filter(
    (pg) =>
      pg.title.toLowerCase().includes(q) ||
      pg.titleZh.includes(q) ||
      pg.keywords
        .toLowerCase()
        .split(" ")
        .some((k) => k.includes(q)),
  );
}
