/**
 * Default text for policy pages (overridable from Admin → Settings → Policies).
 * Lightweight markup: `## ` headings, `- ` list items, blank-line paragraphs, `**bold**`.
 * Pure-constant module — importable from both server (fallback) and client (form defaults).
 * Each policy now has a { zh, en } pair so the rendered page can switch with the user's language.
 */

const PRIVACY_EN = `## 1. Information We Collect
- Account info: the email and name you provide at registration, plus your encrypted password.
- Order info: recipient name, phone, shipping address, ordered items, amounts, and payment status.
- Device & log info: IP address, browser type, time of access, and browsing history.

## 2. How We Use Your Information
- Create and manage your account; provide login, orders, payment, and shipping.
- Process orders, refunds, and after-sales service.
- Send order-status notifications and essential service messages.
- Protect account and transaction security, and prevent fraud and abuse.

## 3. Sharing & Disclosure
We do not sell your personal information to third parties. We share only what is necessary to complete transactions (shipping, payment) or when required by law.

## 4. Storage & Protection
Your information is stored on secured servers and protected with HTTPS encryption, encrypted passwords, access controls, and log audits. Please keep your account credentials safe.

## 5. Your Rights (GDPR)
You have the right to access, correct, delete, restrict processing, port, object to, and withdraw consent for your data. You may exercise these rights at any time by contacting our support email; we will respond within 15 business days.

## 6. Minors
This service is intended for adults. Minors should use it under guardian supervision.

## 7. Updates & Contact
We may revise this policy from time to time and publish the updated version. For questions, please contact our support email.`;

const PRIVACY_ZH = `## 1. 我们收集的信息
- 账户信息：注册时填写的邮箱、姓名以及加密后的密码。
- 订单信息：收件人姓名、电话、收货地址、下单商品、金额及支付状态。
- 设备与日志信息：IP 地址、浏览器类型、访问时间、浏览历史。

## 2. 我们如何使用您的信息
- 创建与管理您的账户，提供登录、下单、支付、配送服务。
- 处理订单、退款及售后服务。
- 发送订单状态通知及必要的服务消息。
- 保障账户与交易安全，防范欺诈与滥用。

## 3. 共享与披露
我们不会将您的个人信息出售给第三方。仅为完成交易（配送、支付）或法律法规要求的情形下共享必要信息。

## 4. 存储与保护
您的信息存储在受保护的服务器上，通过 HTTPS 加密、加密密码、访问控制与日志审计加以保护。请妥善保管您的账户凭证。

## 5. 您的权利（GDPR）
您有权访问、更正、删除、限制处理、迁移、反对并撤回对您数据的同意。您可随时通过联系客服邮箱行使这些权利，我们将在 15 个工作日内回复。

## 6. 未成年人
本服务面向成年人。未成年人请在监护人陪同下使用。

## 7. 政策更新与联系方式
我们可能不时修订本政策并发布更新版本。如有疑问请联系客服邮箱。`;

const TERMS_EN = `## 1. Service Description
We provide product browsing, purchasing, payment, shipping, and after-sales service. By using this service you agree to these terms.

## 2. Account Management
- Provide true and accurate registration information, and keep your credentials safe.
- Losses caused by poor credential management are your responsibility.
- We may restrict accounts that pose a security risk or violate these terms.

## 3. Orders & Payment
- Placing an order indicates your intent to purchase; please complete payment promptly.
- Prices are as shown on the checkout page; promotions and coupons follow their stated rules.
- Orders left unpaid may be automatically cancelled by the system.

## 4. Shipping & Inspection
- We will ship within the stated timeframe; track progress in your order details.
- Inspect items on delivery and contact support promptly if there is an issue.

## 5. Intellectual Property
All trademarks, pages, images, text, and other content belong to us or the rights holders. Unauthorized use is prohibited.

## 6. Limitation of Liability
We are not liable for service interruptions caused by force majeure, network failures, or other events outside our control, but we will work to restore service.

## 7. Updates to These Terms
We may revise these terms and publish the update on-site. Continued use constitutes acceptance of the revised terms.`;

const TERMS_ZH = `## 1. 服务说明
我们提供商品浏览、购买、支付、配送及售后服务。使用本服务即表示您同意本条款。

## 2. 账户管理
- 提供真实准确的注册信息，并妥善保管账户凭证。
- 因凭证管理不当造成的损失由您自行承担。
- 我们可能对存在安全风险或违反本条款的账户进行限制。

## 3. 订单与支付
- 下单即表示购买意愿，请及时完成支付。
- 价格以结算页显示为准；促销活动与优惠券遵循其各自规则。
- 超过支付时限的订单系统可能自动取消。

## 4. 配送与验收
- 我们将在规定时间内发货，您可在订单详情中查看进度。
- 收货时请当面验收，如有问题请及时联系客服。

## 5. 知识产权
所有商标、页面、图片、文字及其他内容均归我们或权利人所有。未经授权禁止使用。

## 6. 责任限制
因不可抗力、网络故障等我们无法控制的事件导致服务中断的，我们不承担责任，但会努力恢复服务。

## 7. 条款更新
我们可能修订本条款并在站内发布更新。继续使用即视为接受修订后的条款。`;

const REFUND_EN = `## 1. 7-Day No-Reason Returns
Within 7 days of receiving your item, you may request a no-reason return or exchange, provided the product is in resaleable condition.

## 2. Refund Conditions
- The product must be intact, with all accessories, tags, and gifts included.
- Custom, perishable, and intimate-wear items are not eligible for no-reason returns.
- Shipping for quality-related returns is borne by us.

## 3. Refund Process
- Submit a refund request from your order details, including the reason and amount.
- Once approved by support, the refund will be returned to your original payment method.
- Refunds typically arrive within 1-7 business days, depending on the payment provider.

## 4. Special Cases
- Rejections, damage during return transit, etc. are handled per actual responsibility.
- For questions, please contact customer support.`;

const REFUND_ZH = `## 1. 7 天无理由退货
收到商品 7 天内，在不影响二次销售的前提下，您可以申请无理由退换货。

## 2. 退款条件
- 商品需完好，配件、吊牌、赠品齐全。
- 定制类、易腐类、贴身衣物不支持无理由退货。
- 质量问题相关的退货运费由我们承担。

## 3. 退款流程
- 在订单详情页提交退款申请，填写原因与金额。
- 经客服审核通过后，退款将原路返回。
- 退款到账通常需要 1-7 个工作日，具体以支付渠道为准。

## 4. 特殊情况
- 拒收、退回运输损坏等情况按实际责任划分处理。
- 如有疑问请联系客服。`;

const COOKIES_EN = `## What Are Cookies
Cookies are small text files that websites store in your browser to identify your device and preferences.

## How We Use Cookies
- Maintain login state and your cart contents.
- Remember preferences and improve your browsing experience.
- Perform traffic analytics and security protection.

## Local Storage
We may use browser local storage (localStorage) to save your cart, cookie consent, and similar data.

## Managing Cookies
You can clear or disable cookies in your browser settings, but this may affect features like login and the shopping cart.

## Third-Party Cookies
Services such as payment (Stripe) may set necessary third-party cookies to complete payment and risk control.`;

const COOKIES_ZH = `## 什么是 Cookie
Cookie 是网站存储在您浏览器中的小型文本文件，用于识别您的设备和偏好。

## 我们如何使用 Cookie
- 维持您的登录状态与购物车内容。
- 记忆您的偏好，提升浏览体验。
- 进行流量统计与安全防护。

## 本地存储
我们可能使用浏览器本地存储（localStorage）保存购物车、Cookie 同意状态等数据。

## 管理 Cookie
您可以在浏览器设置中清除或禁用 Cookie，但可能影响登录、购物车等功能。

## 第三方 Cookie
支付（Stripe）等服务可能设置必要的第三方 Cookie 以完成支付与风控。`;

const ACCESSIBILITY_EN = `We are committed to making our website usable by everyone, including people with disabilities. We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA and follow general best practices for accessible design.

The site is designed to work with screen readers, keyboard navigation and common assistive technologies. Text alternatives are provided for meaningful imagery, focus states are visible throughout the interface, and color contrast meets minimum readability thresholds.

If you experience any difficulty accessing or using this store, please contact us and describe the issue along with the page address. We take feedback seriously and will do our best to provide the content you need through an alternative method.`;

const ACCESSIBILITY_ZH = `我们致力于让所有人（包括残障人士）都能正常使用本网站，目标是符合 WCAG 2.1 AA 级无障碍标准，并遵循无障碍设计的通行最佳实践。

网站兼容屏幕阅读器、键盘导航与常见辅助技术：为有意义的图片提供替代文本，界面焦点状态清晰可见，色彩对比度满足最低可读性要求。

如果您在访问或使用本商店时遇到困难，请与我们联系并附上问题页面地址。我们认真对待每一条反馈，将尽力通过其他方式向您提供所需内容。`;

export const POLICY_DEFAULTS = {
  accessibility: { zh: ACCESSIBILITY_ZH, en: ACCESSIBILITY_EN },
  privacy: { zh: PRIVACY_ZH, en: PRIVACY_EN },
  terms: { zh: TERMS_ZH, en: TERMS_EN },
  refund: { zh: REFUND_ZH, en: REFUND_EN },
  cookies: { zh: COOKIES_ZH, en: COOKIES_EN },
} as const;

export type PolicyKey = keyof typeof POLICY_DEFAULTS;

export const POLICY_TITLES: Record<PolicyKey, { zh: string; en: string }> = {
  accessibility: { zh: "无障碍声明", en: "Accessibility Statement" },
  privacy: { zh: "隐私政策", en: "Privacy Policy" },
  terms: { zh: "服务条款", en: "Terms of Service" },
  refund: { zh: "退款政策", en: "Refund Policy" },
  cookies: { zh: "Cookie 政策", en: "Cookie Policy" },
};

/** Get the policy text for the current language. */
export function getPolicyContent(key: PolicyKey, lang: "zh" | "en"): string {
  return POLICY_DEFAULTS[key][lang] ?? POLICY_DEFAULTS[key].en;
}

/** Get the policy title for the current language. */
export function getPolicyTitle(key: PolicyKey, lang: "zh" | "en"): string {
  return POLICY_TITLES[key][lang] ?? POLICY_TITLES[key].en;
}
