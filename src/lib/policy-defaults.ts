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

const REFUND_EN = `## 1. Refund Scope
We currently support refund requests for eligible online-paid and cash-on-delivery orders. The system does not provide an automated no-reason return or exchange workflow.

## 2. Refund Conditions
- Submit the request from the order details while the order is active.
- The requested amount cannot exceed the order amount remaining after earlier refunds.
- Quality, damage, non-delivery, and other statutory rights are assessed by support.

## 3. Refund Process
- Submit a refund request with the reason and amount.
- Support reviews the request and records the decision.
- Approved online refunds are returned to the original payment method; cash-on-delivery refunds are handled offline.
- Processing time depends on the payment provider and may take 1-7 business days after the gateway confirms success.

## 4. Returns and Exchanges
Return shipping, exchange, inspection, and restocking workflows are not yet automated in this release. Please contact customer support before sending any goods back. Do not ship merchandise until support provides the return instructions and address.

## 5. Special Cases
The final responsibility and any return shipping cost are determined from the order evidence and applicable law. For questions, please contact customer support.`;

const REFUND_ZH = `## 1. 退款范围
当前版本支持符合条件且处于有效状态的在线支付与货到付款订单退款申请。系统暂未提供自动化的无理由退货或换货流程。

## 2. 退款条件
- 请在订单详情中提交申请，订单需处于可退款状态。
- 本次退款金额不得超过扣除历史退款后的剩余可退金额。
- 质量问题、商品损坏、未送达及其他法定权益由客服结合订单证据审核。

## 3. 退款流程
- 提交退款原因和申请金额。
- 客服审核并记录处理结论。
- 在线支付退款原路退回；货到付款退款通过线下方式处理。
- 退款到账时间取决于支付渠道，通常在支付机构确认成功后 1-7 个工作日内到账。

## 4. 退货与换货
当前版本尚未自动化退货、换货、质检、入库和返仓运费流程。如需退回商品，请先联系客服；在客服提供退货地址和退货说明前，请不要寄回商品。

## 5. 特殊情况
退款责任与退货运费根据订单证据和适用法律判定。如有疑问请联系客服。`;

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

/* 无障碍声明按「分节完整版」撰写（2026-09-22）：
   此前是 3 段短文案（正文仅 474px），页面短于视口 → 页脚停在内容之后，
   视口底部露出 153px 白底，与原站观感不一致（原站该页为分节长文）。
   同一文件内隐私政策 7 节、数据共享 5 节，无障碍声明也应保持同等完整度。
   管理员仍可在后台「法务页面 → 无障碍声明」整段覆盖。 */
const ACCESSIBILITY_EN = `## 1. Our Commitment
We are committed to making this online store usable by everyone, including people with disabilities. Accessibility is treated as an ongoing requirement rather than a one-off task, and it is reviewed as the store evolves.

We aim to conform to the **Web Content Accessibility Guidelines (WCAG) 2.1 Level AA**, the standard most commonly referenced by regulators and assistive technology vendors.

## 2. Conformance Status
This store is **partially conformant** with WCAG 2.1 Level AA: most pages satisfy the criteria, while the items listed under "Known Limitations" are still being remediated.

Accessibility work is tracked as part of our normal release process, so improvements ship with regular store updates.

## 3. Accessibility Features
- **Text alternatives**: meaningful imagery carries descriptive alternative text, and decorative imagery is hidden from assistive technology.
- **Keyboard operation**: navigation, menus, forms, cart and checkout can all be reached and operated with the keyboard alone, with a visible focus indicator.
- **Structure and semantics**: pages use landmark regions, ordered headings, labelled form fields and table headers, so screen readers can announce content meaningfully.
- **Colour and contrast**: text and interface controls meet or exceed the WCAG AA contrast thresholds, and colour is never the only way information is conveyed.
- **Resizable text and zoom**: layouts reflow when text is enlarged and remain usable at 200% browser zoom.
- **Motion**: animations respect the operating system "reduce motion" preference and are decorative only.
- **Responsive layout**: the store adapts to phone, tablet and desktop widths without horizontal scrolling.

## 4. Compatibility with Browsers and Assistive Technology
The store is built on standards-compliant HTML, CSS and JavaScript, and is intended to work with current versions of Chrome, Safari, Firefox and Edge, together with common assistive technologies such as screen readers, screen magnifiers, speech recognition software and switch devices.

Naming a browser or tool does not guarantee full compatibility. If a particular combination does not work for you, please tell us so we can investigate.

## 5. Technical Specifications
- Structure and semantics are provided by HTML, and presentation by CSS.
- Where a custom control is required, the WAI-ARIA specification is used to expose its name, role and state.
- Conformance has been assessed against WCAG 2.1 Level AA.
- Content is authored in the language of the page, and that language is declared in the markup.

## 6. Known Limitations
- A small number of older pages and third-party embedded widgets may not yet meet every AA criterion; we work through them in priority order.
- Some product imagery comes from external catalogues and may carry shorter alternative text than we would prefer.
- If you meet a barrier that is not listed here, please contact us — we will provide the information you need through an alternative channel while the underlying issue is fixed.

## 7. Feedback and Contact
We welcome feedback on the accessibility of this store. If you experience any difficulty accessing or using it, please contact our support team and include the page address, a short description of the problem, and the browser or assistive technology you were using.

We aim to acknowledge accessibility feedback within a few business days and to supply the requested content in an accessible alternative format on request.

## 8. Assessment Approach
This statement is based on our ongoing self-assessment of the store, covering manual keyboard and screen-reader checks, automated accessibility scans, and review of new pages before they go live.`;

const ACCESSIBILITY_ZH = `## 1. 我们的承诺
我们致力于让所有人（包括残障人士）都能正常使用本在线商店。无障碍被视为一项持续要求，而非一次性任务，并随商店的迭代不断复查。

我们的目标是符合 **WCAG 2.1 AA 级**（Web Content Accessibility Guidelines）无障碍标准——这也是监管机构与辅助技术厂商最常引用的标准。

## 2. 符合性状态
本站目前**部分符合** WCAG 2.1 AA 级：绝大多数页面已满足相应准则，少数列在「已知限制」中的问题仍在修复。

无障碍改进纳入常规发布流程，随商店的日常更新一并上线。

## 3. 无障碍功能
- **替代文本**：有意义的图片配有描述性替代文本，纯装饰性图片对辅助技术隐藏。
- **键盘操作**：导航、菜单、表单、购物车与结账流程均可仅用键盘到达并操作，焦点状态清晰可见。
- **结构与语义**：页面使用地标区域、有序标题层级、带标签的表单字段与表格表头，便于屏幕阅读器准确朗读。
- **色彩与对比度**：正文与界面控件的对比度满足或超过 WCAG AA 阈值；颜色从不是传达信息的唯一方式。
- **文字缩放**：放大文字时布局自动重排，浏览器缩放至 200% 仍可正常使用。
- **动效**：动画遵循操作系统的「减少动态效果」偏好，且仅为装饰性。
- **响应式布局**：适配手机、平板与桌面宽度，不出现横向滚动。

## 4. 浏览器与辅助技术兼容性
本站基于符合标准的 HTML、CSS 与 JavaScript 构建，面向当前版本的 Chrome、Safari、Firefox、Edge，以及屏幕阅读器、屏幕放大软件、语音识别软件、开关设备等常见辅助技术。

列出某款浏览器或工具并不代表完全兼容。如某个组合在您这里无法使用，请告知我们，以便排查。

## 5. 技术规格
- 结构与语义由 HTML 提供，表现层由 CSS 提供。
- 需要自定义控件时，使用 WAI-ARIA 规范暴露其名称、角色与状态。
- 符合性依据 WCAG 2.1 AA 级进行评估。
- 内容按页面语言撰写，并在标记中声明该语言。

## 6. 已知限制
- 少数较早的页面与第三方嵌入组件可能尚未满足全部 AA 准则，我们正按优先级逐步处理。
- 部分商品图片来自外部目录，其替代文本可能比我们期望的更简短。
- 如果您遇到此处未列出的障碍，请与我们联系——在问题修复期间，我们将通过其他方式向您提供所需信息。

## 7. 反馈与联系方式
我们欢迎您对本商店的无障碍体验提出反馈。如果您在访问或使用中遇到困难，请联系客服，并附上问题页面地址、问题的简要描述，以及您所使用的浏览器或辅助技术。

我们会在数个工作日内确认无障碍反馈，并在您要求时以无障碍的替代格式提供所需内容。

## 8. 评估方式
本声明基于我们对商店持续的自我评估，包括人工键盘与屏幕阅读器测试、自动化无障碍扫描，以及新页面上线前的审查。`;

const DATA_SHARING_EN = `## Your rights
Depending on where you live, you may have the right to opt out of the "sale" or "sharing" of your personal information for targeted advertising, and to limit the use of sensitive personal information.

## What we share
We do not sell your personal information for money. We may share limited identifiers and device information with advertising and analytics partners so we can measure and improve our marketing. You can stop this sharing at any time using the controls below.

## How to opt out
- Submit the form on this page, or
- Email our support address with the subject "Do Not Sell or Share My Personal Information", or
- Use the "Your Privacy Choices" link in the footer of any page.

We will confirm your request within 15 business days. Opting out will not change the price you pay or the quality of service you receive.

## Authorized agents
You may designate an authorized agent to submit a request on your behalf. We may ask for proof that the agent is authorized to act for you.

## Verification
To protect your data, we may ask you to verify your identity before we act on a request. We only ask for the minimum information needed to match your request to our records.`;

const DATA_SHARING_ZH = `## 您的权利
根据您所在地区的法律，您有权选择退出个人信息的「出售」或「共享」（用于定向广告），并有权限制敏感个人信息的使用。

## 我们共享了什么
我们不会为换取金钱而出售您的个人信息。我们可能与广告与分析合作伙伴共享有限的标识符与设备信息，用于衡量和改进我们的营销效果。您可以随时通过下方控件停止此类共享。

## 如何选择退出
- 提交本页表单；或
- 向我们的客服邮箱发送邮件，标题为「请勿出售或共享我的个人信息」；或
- 使用任意页面页脚中的「您的隐私选择」链接。

我们将在 15 个工作日内确认您的请求。选择退出不会改变您支付的价格，也不会影响您获得的服务质量。

## 授权代理
您可以指定授权代理代您提交请求。我们可能要求提供该代理已获授权的证明。

## 身份核验
为保护您的数据，我们可能在处理请求前要求核验您的身份。我们只收集将请求与记录匹配所需的最少信息。`;

export const POLICY_DEFAULTS = {
  accessibility: { zh: ACCESSIBILITY_ZH, en: ACCESSIBILITY_EN },
  privacy: { zh: PRIVACY_ZH, en: PRIVACY_EN },
  terms: { zh: TERMS_ZH, en: TERMS_EN },
  refund: { zh: REFUND_ZH, en: REFUND_EN },
  cookies: { zh: COOKIES_ZH, en: COOKIES_EN },
  dataSharingOptOut: { zh: DATA_SHARING_ZH, en: DATA_SHARING_EN },
} as const;

export type PolicyKey = keyof typeof POLICY_DEFAULTS;

export const POLICY_TITLES: Record<PolicyKey, { zh: string; en: string }> = {
  accessibility: { zh: "无障碍声明", en: "Accessibility Statement" },
  privacy: { zh: "隐私政策", en: "Privacy Policy" },
  /* 原站 `/pages/terms-and-conditions` 实测：title 与 h1 都是 **`Terms and Conditions`**
     （不是 `Terms of Service`）。页脚那条链接的文案也是 `Terms and Conditions`，
     改后两者一致。 */
  terms: { zh: "条款与条件", en: "Terms and Conditions" },
  refund: { zh: "退款政策", en: "Refund Policy" },
  cookies: { zh: "Cookie 政策", en: "Cookie Policy" },
  dataSharingOptOut: { zh: "您的隐私选择", en: "Your Privacy Choices" },
};

/** Get the policy text for the current language. */
export function getPolicyContent(key: PolicyKey, lang: "zh" | "en"): string {
  return POLICY_DEFAULTS[key][lang] ?? POLICY_DEFAULTS[key].en;
}

/** Get the policy title for the current language. */
export function getPolicyTitle(key: PolicyKey, lang: "zh" | "en"): string {
  return POLICY_TITLES[key][lang] ?? POLICY_TITLES[key].en;
}
