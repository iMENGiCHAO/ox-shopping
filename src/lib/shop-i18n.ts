/** Shop (frontend) i18n — minimal zh/en dictionary + helpers.
 * Strategy: key is the English source string (used directly when `en`),
 * `zh` provides the Chinese translation. Same approach as admin-i18n.
 * Language state is managed by I18nProvider (client context) and a server
 * cookie (read via shop-i18n-server.getLang). */

export type Lang = "zh" | "en";

export const LANGS: Lang[] = ["zh", "en"];

export const LANG_LABEL: Record<Lang, string> = {
  zh: "中文",
  en: "English",
};

export const LANG_SHORT: Record<Lang, string> = {
  zh: "中",
  en: "EN",
};

/** Cookie + localStorage key for persisting the shop language. */
export const SHOP_LANG_KEY = "shop-lang";

type Dict = Record<string, Partial<Record<Lang, string>>>;

/** The full shop string catalog. Key is the English source string;
 *  `zh` provides the Chinese rendering. */
const DICT: Dict = {
  /* ── Account / data export ─────────────────────────────────────── */
  "Download my data": { en: "Download my data", zh: "下载我的数据" },
  "Export a copy of your personal data (profile, orders and subscriptions) as JSON.": {
    en: "Export a copy of your personal data (profile, orders and subscriptions) as JSON.",
    zh: "将你的个人数据（资料、订单与订阅）导出为 JSON 文件。",
  },
  "Export my data": { en: "Export my data", zh: "导出我的数据" },

  /* ── Brand & tagline ───────────────────────────────────────────── */
  "Considered design": { en: "Considered design", zh: "用心设计" },
  "Considered goods for everyday living. Thoughtfully designed, responsibly made.": {
    en: "Considered goods for everyday living. Thoughtfully designed, responsibly made.",
    zh: "为日常而生的精选好物。精心设计，用心制造。",
  },
  "Switch language": { en: "Switch language", zh: "切换语言" },

  /* ── Top nav (header) ──────────────────────────────────────────── */
  Shop: { en: "Shop", zh: "购物" },
  "All Products": { en: "All Products", zh: "全部商品" },
  "New Arrivals": { en: "New Arrivals", zh: "新品上架" },
  Bestsellers: { en: "Bestsellers", zh: "热销榜单" },
  Account: { en: "Account", zh: "账户" },
  "Sign In": { en: "Sign In", zh: "登录" },
  Login: { en: "Login", zh: "登录" },
  "E-mail": { en: "E-mail", zh: "邮箱" },
  "Enter your email and password to login:": {
    en: "Enter your email and password to login:",
    zh: "请输入邮箱与密码登录：",
  },
  "Don't have an account?": { en: "Don't have an account?", zh: "还没有账号？" },
  FAQs: { en: "FAQs", zh: "常见问题" },
  "Accessibility Statement": { en: "Accessibility Statement", zh: "无障碍声明" },
  "Terms and Conditions": { en: "Terms and Conditions", zh: "条款与条件" },
  "Refund Policy": { en: "Refund Policy", zh: "退款政策" },
  "Cookie Consent": { en: "Cookie Consent", zh: "Cookie 同意" },
  "Sold out": { en: "Sold out", zh: "已售罄" },
  "Notify me": { en: "Notify me", zh: "到货通知" },
  "Notify me when back in stock": { en: "Notify me when back in stock", zh: "到货时通知我" },
  "Get a notification as soon as this product is back in stock by signing up below": {
    en: "Get a notification as soon as this product is back in stock by signing up below",
    zh: "填写邮箱，到货后第一时间通知您",
  },
  "Notify me when available": { en: "Notify me when available", zh: "到货通知我" },
  "You'll only receive notifications for this product": {
    en: "You'll only receive notifications for this product",
    zh: "仅在该商品到货时发送通知",
  },
  "Thank you! We will notify you when the product is available": {
    en: "Thank you! We will notify you when the product is available",
    zh: "谢谢！到货后我们将通知您",
  },
  "Please select a variant to be notified about": {
    en: "Please select a variant to be notified about",
    zh: "请选择要关注的规格/颜色",
  },
  "Enter your email": { en: "Enter your email", zh: "请输入邮箱" },
  "Email address": { en: "Email address", zh: "邮箱地址" },
  "We'll email you when this product is back in stock": {
    en: "We'll email you when this product is back in stock",
    zh: "到货后我们将邮件通知您",
  },
  "You're on the list for this product": {
    en: "You're on the list for this product",
    zh: "您已登记该商品到货通知",
  },
  New: { en: "New", zh: "新品" },
  Hot: { en: "Hot", zh: "热卖" },
  Sale: { en: "Sale", zh: "特惠" },
  Cost: { en: "Cost", zh: "成本价" },
  "Search...": { en: "Search...", zh: "搜索..." },
  "result for": { en: "result for", zh: "个结果：" },
  "results for": { en: "results for", zh: "个结果：" },
  Pages: { en: "Pages", zh: "页面" },
  Relevance: { en: "Relevance", zh: "相关度" },
  "Price, low to high": { en: "Price, low to high", zh: "价格从低到高" },
  "Price, high to low": { en: "Price, high to low", zh: "价格从高到低" },
  Filters: { en: "Filters", zh: "筛选" },
  "In stock only": { en: "In stock only", zh: "仅显示有货" },
  "View results": { en: "View results", zh: "查看结果" },
  "No results found.": { en: "No results found.", zh: "没有找到相关结果。" },
  Suggestions: { en: "Suggestions", zh: "搜索建议" },
  "View all results": { en: "View all results", zh: "查看所有结果" },
  /* 搜索浮层空态的两个集合入口（原站实测固定为这两条，与集合名一致） */
  "X Collection": { en: "X Collection", zh: "X Collection" },
  "SpaceXAI Collection": { en: "SpaceXAI Collection", zh: "SpaceXAI Collection" },
  "Sign Out": { en: "Sign Out", zh: "退出登录" },
  "Create Account": { en: "Create Account", zh: "创建账户" },
  "My Orders": { en: "My Orders", zh: "我的订单" },
  /** 短标签（移动端 <sm 视口） */
  Orders: { en: "Orders", zh: "订单" },
  Policies: { en: "Policies", zh: "政策条款" },
  "Privacy Policy": { en: "Privacy Policy", zh: "隐私政策" },
  "Terms of Service": { en: "Terms of Service", zh: "服务条款" },
  "Cookie Policy": { en: "Cookie Policy", zh: "Cookie 政策" },
  /* 结账页脚第三条（原站 checkout 页脚为 Refund policy · Privacy policy · Cookies） */
  Cookies: { en: "Cookies", zh: "Cookie" },

  /* ── User menu ────────────────────────────────────────────────── */
  "My Account": { en: "My Account", zh: "个人中心" },
  "Product removed": { en: "Product removed", zh: "商品已下架" },
  "item(s)": { en: "item(s)", zh: "件" },
  "Size Charts": { en: "Size Charts", zh: "参数对照表" },
  Profile: { en: "Profile", zh: "个人资料" },
  "Change Password": { en: "Change Password", zh: "修改密码" },
  "Shipping Address": { en: "Shipping Address", zh: "收货地址" },

  /* ── Header cart & search ─────────────────────────────────────── */
  Cart: { en: "Cart", zh: "购物车" },
  "Shopping Bag": { en: "Shopping Bag", zh: "购物袋" },
  Search: { en: "Search", zh: "搜索" },
  "Search products": { en: "Search products", zh: "搜索商品" },

  /* ── Home page ────────────────────────────────────────────────── */
  Featured: { en: "Featured", zh: "综合排序" },
  "New in": { en: "New in", zh: "新品" },
  "Trending now": { en: "Trending now", zh: "热销中" },
  "For your home": { en: "For your home", zh: "为你的家" },
  "Best selling": { en: "Best selling", zh: "销量优先" },
  "Browse products": { en: "Browse products", zh: "去看看商品" },
  "Shop now": { en: "Shop now", zh: "立即选购" },

  /* ── Product listing pages ────────────────────────────────────── */
  Products: { en: "Products", zh: "商品" },
  "Sort by": { en: "Sort by", zh: "排序方式" },
  "Price: low to high": { en: "Price: low to high", zh: "价格从低到高" },
  "Price: high to low": { en: "Price: high to low", zh: "价格从高到低" },
  "No products found": { en: "No products found", zh: "没有找到商品" },
  "No products found. Try a different filter.": {
    en: "No products found. Try a different filter.",
    zh: "没有找到商品，换个筛选条件试试吧。",
  },
  "Load more": { en: "Load more", zh: "加载更多" },
  filters: { en: "filters", zh: "筛选" },
  "Clear filters": { en: "Clear filters", zh: "清除筛选" },
  "In stock": { en: "In stock", zh: "有货" },
  "Out of stock": { en: "Out of stock", zh: "缺货" },
  /* 大爷需求：库存即时友好提示——加购时即提示，不等结账 */
  "Only {n} left": { en: "Only {n} left", zh: "仅剩 {n} 件" },
  "Insufficient stock, only {n} left": {
    en: "Insufficient stock, only {n} left",
    zh: "库存不足，当前仅剩 {n} 件",
  },
  "Pre-order": { en: "Pre-order", zh: "预售" },
  "You may also like": { en: "You may also like", zh: "你可能也喜欢" },
  "404 Page not found": { en: "404 Page not found", zh: "404 页面不存在" },
  "The page you requested does not exist.": {
    en: "The page you requested does not exist.",
    zh: "您访问的页面不存在或已被移除。",
  },
  "All collections": { en: "All collections", zh: "全部分类" },
  Availability: { en: "Availability", zh: "库存状况" },
  Price: { en: "Price", zh: "价格" },
  "Pre-order item — ships within 14 days of payment": {
    en: "Pre-order item — ships within 14 days of payment",
    zh: "预售商品：付款后 14 天内发货",
  },
  Preorder: { en: "Preorder", zh: "预定" },
  Active: { en: "Active", zh: "在售" },
  Offline: { en: "Offline", zh: "下架" },
  "Product Status": { en: "Product Status", zh: "商品状态" },

  /* ── Product detail ───────────────────────────────────────────── */
  Details: { en: "Details", zh: "详情" },
  "Related recommendations": { en: "Related recommendations", zh: "相关推荐" },
  "Add to cart": { en: "Add to cart", zh: "加入购物车" },
  "Buy now": { en: "Buy now", zh: "立即购买" },
  Color: { en: "Color", zh: "颜色" },
  Capacity: { en: "Capacity", zh: "容量" },
  Size: { en: "Size", zh: "尺寸" },
  Storage: { en: "Storage", zh: "存储" },
  Spec: { en: "Spec", zh: "规格" },
  Type: { en: "Type", zh: "类型" },
  Version: { en: "Version", zh: "版本" },
  Variant: { en: "Variant", zh: "规格" },
  Configuration: { en: "Configuration", zh: "配置" },
  Graphics: { en: "Graphics", zh: "显卡" },
  Switch: { en: "Switch", zh: "轴体" },
  "Recommended Area": { en: "Recommended Area", zh: "适用面积" },
  Submit: { en: "Submit", zh: "提交" },
  "Submitting…": { en: "Submitting…", zh: "提交中…" },
  /* ── Cookie consent banner ──────────────────────────────────────
     句子在组件里由「前半句 + <Link>Cookie Policy</Link> + .」拼成，
     因此词条要写到 `See our` 为止，拼出来才是
     "…means you agree to our use of cookies. See our Cookie Policy."。
     此前词条写到 `our use of` 就断了，实际渲染成
     "…our use of Cookie Policy."（语法错误）。
     另外：这里**必须用单引号**——句中含 `"Accept all"`，
     若改用双引号包裹就会引入 `\"` 转义，而转义写错会让键与调用方不相等，
     表现为「词条在但永远不命中、静默漏出英文」（本次清理掉的两条死词条就是这个成因）。 */
  'We use cookies to improve your browsing experience and analyze traffic. Clicking "Accept all" means you agree to our use of cookies. See our':
    {
      en: 'We use cookies to improve your browsing experience and analyze traffic. Clicking "Accept all" means you agree to our use of cookies. See our',
      zh: "我们使用 Cookie 改进浏览体验并分析流量。点击「全部接受」即表示您同意我们使用 Cookie。详见我们的",
    },
  "Accept all": { en: "Accept all", zh: "接受全部" },
  "Accept necessary only": { en: "Accept necessary only", zh: "仅接受必要" },
  "Necessary only": { en: "Necessary only", zh: "仅必要" },
  "Cookie consent cleared — you'll be asked again on the next visit": {
    en: "Cookie consent cleared — you'll be asked again on the next visit",
    zh: "已清除 Cookie 同意记录，下次访问时将重新询问",
  },
  "Reset cookie consent": { en: "Reset cookie consent", zh: "重置 Cookie 同意" },

  /* ── Cart ─────────────────────────────────────────────────────── */
  "Your cart is empty": { en: "Your cart is empty", zh: "购物车是空的" },
  "Your cart is empty — start adding products.": {
    en: "Your cart is empty — start adding products.",
    zh: "购物车是空的，快去挑选心仪的商品吧。",
  },
  Subtotal: { en: "Subtotal", zh: "小计" },
  Total: { en: "Total", zh: "合计" },
  Shipping: { en: "Shipping", zh: "运费" },
  Estimate: { en: "Estimate", zh: "估算" },
  Checkout: { en: "Checkout", zh: "结算" },
  Remove: { en: "Remove", zh: "删除" },
  remove: { en: "remove", zh: "删除" },
  Qty: { en: "Qty", zh: "数量" },
  Quantity: { en: "Quantity", zh: "数量" },
  "Continue shopping": { en: "Continue shopping", zh: "继续购物" },
  Product: { en: "Product", zh: "商品" },
  "Total:": { en: "Total:", zh: "合计：" },
  USD: { en: "USD", zh: "USD" },
  "Taxes and shipping calculated at checkout": {
    en: "Taxes and shipping calculated at checkout",
    zh: "税费与运费将在结算时计算",
  },
  Pagination: { en: "Pagination", zh: "分页" },
  "Contact us": { en: "Contact us", zh: "联系我们" },
  "Share product card": { en: "Share product card", zh: "分享商品卡" },
  "Copy link": { en: "Copy link", zh: "复制链接" },
  Share: { en: "Share", zh: "分享" },
  "Share to": { en: "Share to", zh: "分享到" },
  WeChat: { en: "WeChat", zh: "微信" },
  "Scan with WeChat": { en: "Scan with WeChat", zh: "微信扫一扫" },
  Close: { en: "Close", zh: "关闭" },
  "Could not generate QR code": { en: "Could not generate QR code", zh: "二维码生成失败" },
  "Copy failed, please copy the link manually": {
    en: "Copy failed, please copy the link manually",
    zh: "复制失败，请手动复制链接",
  },
  About: { en: "About", zh: "关于商品" },
  "Product card saved — link copied": {
    en: "Product card saved — link copied",
    zh: "商品卡已保存，链接已复制",
  },
  "Link copied": { en: "Link copied", zh: "链接已复制" },
  "View product": { en: "View product", zh: "查看商品" },
  "Didn't find your answer? Contact us.": {
    en: "Didn't find your answer? Contact us.",
    zh: "没有找到答案？联系我们",
  },
  "FAQs · Frequently Asked Questions": {
    en: "FAQs · Frequently Asked Questions",
    zh: "常见问题 · FAQ",
  },
  "Contact us — we reply within 1 business day": {
    en: "Contact us — we reply within 1 business day",
    zh: "联系我们 · 工作日 24 小时内回复",
  },
  "Back to cart": { en: "Back to cart", zh: "返回购物车" },
  Items: { en: "Items", zh: "商品" },
  Summary: { en: "Summary", zh: "结算栏" },
  Apply: { en: "Apply", zh: "应用" },
  "Payment method": { en: "Payment method", zh: "支付方式" },
  "Not available yet": { en: "Not available yet", zh: "暂未开通" },
  "Not available for this currency — switch currency or pick another method": {
    en: "Not available for this currency — switch currency or pick another method",
    zh: "不支持当前币种，请切换币种或选择其他支付方式",
  },

  /* ── Cart drawer ───────────────────────────────────────────────── */
  "Your Bag": { en: "Your Bag", zh: "购物袋" },
  "Loading…": { en: "Loading…", zh: "加载中…" },
  "Discover something you'll love.": {
    en: "Discover something you'll love.",
    zh: "去发现你会喜欢的好物。",
  },
  "Start Shopping": { en: "Start Shopping", zh: "开始购物" },
  "Shipping & taxes calculated at checkout.": {
    en: "Shipping & taxes calculated at checkout.",
    zh: "运费与税费将在结算时计算。",
  },
  "View Full Bag": { en: "View Full Bag", zh: "查看完整购物袋" },
  "Sign in to track orders and save your bag": {
    en: "Sign in to track orders and save your bag",
    zh: "登录以跟踪订单并保存购物袋",
  },

  /* ── Checkout flow ────────────────────────────────────────────── */
  "Select shipping address": { en: "Select shipping address", zh: "选择收货地址" },
  "Please select a shipping address first": {
    en: "Please select a shipping address first",
    zh: "请先选择收货地址",
  },
  "Add a shipping address": { en: "Add a shipping address", zh: "新增收货地址" },
  Contact: { en: "Contact", zh: "联系方式" },
  Recipient: { en: "Recipient", zh: "收件人" },
  Phone: { en: "Phone", zh: "手机号" },
  Address: { en: "Address", zh: "详细地址" },
  City: { en: "City", zh: "城市" },
  "State / Province / Region": { en: "State / Province / Region", zh: "省/市/自治区" },
  "ZIP / Postal": { en: "ZIP / Postal", zh: "邮政编码" },
  Email: { en: "Email", zh: "邮箱" },
  Name: { en: "Name", zh: "姓名" },
  "Order number": { en: "Order number", zh: "订单号" },
  "Optional — helps us find your order faster": {
    en: "Optional — helps us find your order faster",
    zh: "选填——便于我们更快定位您的订单",
  },
  Subject: { en: "Subject", zh: "主题" },
  Message: { en: "Message", zh: "留言内容" },
  "Please fill in all required fields": {
    en: "Please fill in all required fields",
    zh: "请填写所有必填项",
  },
  "Send failed, please retry": { en: "Send failed, please retry", zh: "发送失败，请重试" },
  "Your message has been sent.": { en: "Your message has been sent.", zh: "您的留言已提交。" },
  "Our team will reply within one business day.": {
    en: "Our team will reply within one business day.",
    zh: "客服团队将在一个工作日内回复您。",
  },
  "Sending…": { en: "Sending…", zh: "发送中…" },
  "Send message": { en: "Send message", zh: "发送留言" },
  /* ── /pages/contact 联系表单（原站字段名逐字对齐：Name / E-mail / Message） ── */
  "Contact Us": { en: "Contact Us", zh: "联系我们" },
  /* FAQ 答案里的 `{contactForm}` 链接文案 —— 原站原文 “or fill out this form” */
  "this form": { en: "this form", zh: "此表单" },
  "Please enter your name": { en: "Please enter your name", zh: "请输入姓名" },
  "Please enter your message": { en: "Please enter your message", zh: "请输入留言内容" },
  "Failed to send, please try again": {
    en: "Failed to send, please try again",
    zh: "发送失败，请稍后重试",
  },
  "Message sent — we'll get back to you soon.": {
    en: "Message sent — we'll get back to you soon.",
    zh: "留言已发送，我们会尽快回复您。",
  },
  "Place order": { en: "Place order", zh: "提交订单" },
  "Pay now": { en: "Pay now", zh: "前往支付" },
  "Your order has no items": { en: "Your order has no items", zh: "订单中没有商品" },
  "Failed to load checkout data": { en: "Failed to load checkout data", zh: "加载结算数据失败" },
  "Please fill in accurate contact and shipping details.": {
    en: "Please fill in accurate contact and shipping details.",
    zh: "请填写准确的联系方式与收货地址。",
  },
  "Order submitted": { en: "Order submitted", zh: "订单已提交" },
  "Failed to submit your order, please try again later": {
    en: "Failed to submit your order, please try again later",
    zh: "订单提交失败，请稍后重试",
  },
  "Processing…": { en: "Processing…", zh: "处理中…" },
  Processing: { en: "Processing", zh: "处理中" },
  "Please select a shipping method": {
    en: "Please select a shipping method",
    zh: "请选择配送方式",
  },
  "No shipping methods available, please contact customer service.": {
    en: "No shipping methods available, please contact customer service.",
    zh: "暂无可用配送方式，请联系客服。",
  },
  "Address saved": { en: "Address saved", zh: "地址已保存" },
  "Address saved, but failed to refresh the list": {
    en: "Address saved, but failed to refresh the list",
    zh: "地址已保存，但列表刷新失败",
  },
  "Estimated shipping": { en: "Estimated shipping", zh: "预计运费" },
  "Cash on Delivery": { en: "Cash on Delivery", zh: "货到付款" },
  "Pay on delivery:": { en: "Pay on delivery:", zh: "货到付款，到付" },
  /* 结账页运费行 / 运费方式行的「到付」标签（原站此处不带冒号，金额由调用方另行拼接）。 */
  "Pay on delivery": { en: "Pay on delivery", zh: "到付" },
  /* 顶栏购物车图标上的未读通知红点（仅读屏可见的 aria-label）。 */
  "You have unread notifications": {
    en: "You have unread notifications",
    zh: "有未读通知",
  },
  "Free shipping unlocked": { en: "Free shipping unlocked", zh: "已享免邮" },
  "calculated at checkout": { en: "calculated at checkout", zh: "订单确认时计算" },
  "Spend {amount} more for free shipping": {
    en: "Spend {amount} more for free shipping",
    zh: "再凑 {amount} 即可享免邮",
  },
  /* 结账页侧栏的凑单提示（含免邮门槛）。用字典而不是 `lang === "zh" ? ... : ...`
     三元分支 —— 后者会把中文整句写进组件，切语言时容易漏改。 */
  "Spend {amount} more to unlock free shipping (over {threshold})": {
    en: "Spend {amount} more to unlock free shipping (over {threshold})",
    zh: "再买 {amount} 即可免运费（满 {threshold} 免邮）",
  },
  "Please remove out-of-stock items first": {
    en: "Please remove out-of-stock items first",
    zh: "请先删除缺货商品",
  },
  "Some items are out of stock. Please remove them before checkout.": {
    en: "Some items are out of stock. Please remove them before checkout.",
    zh: "购物车中有缺货商品，请删除后再结账",
  },
  "Your cart contains pre-order items. They will ship once back in stock.": {
    en: "Your cart contains pre-order items. They will ship once back in stock.",
    zh: "购物车中有预售商品，发货时间会延后到货时再发出",
  },
  "Current order status: {status}": {
    en: "Current order status: {status}",
    zh: "当前订单状态：{status}",
  },

  /* ── Mock payment & result pages ──────────────────────────────── */
  "Mock payment": { en: "Mock payment", zh: "模拟支付环境" },
  "Mock payment notice": {
    en: "This is the mock payment channel for development and demos — no real money is charged. Clicking [Mock payment successful] will mark the order as paid.",
    zh: "这是用于开发与演示的「模拟支付」渠道，不会产生真实扣款。点击「模拟支付成功」将直接把订单标记为已支付。",
  },
  "Mock payment successful": { en: "Mock payment successful", zh: "模拟支付成功" },
  "Payment cancelled": { en: "Payment cancelled", zh: "支付已取消" },
  "Payment received": { en: "Payment received", zh: "支付成功" },
  "Payment failed, please try again later": {
    en: "Payment failed, please try again later",
    zh: "支付失败，请稍后重试",
  },
  "Payment result": { en: "Payment result", zh: "支付结果" },
  "Your order has been paid — we'll ship it as soon as possible.": {
    en: "Your order has been paid — we'll ship it as soon as possible.",
    zh: "您的订单已支付成功，我们将尽快为您安排发货。",
  },
  "Your order hasn't been paid yet — you can complete payment later from My Orders.": {
    en: "Your order hasn't been paid yet — you can complete payment later from My Orders.",
    zh: "您的订单尚未支付，可稍后在我的订单中继续支付。",
  },
  "Redirecting…": { en: "Redirecting…", zh: "跳转中…" },
  "View order": { en: "View order", zh: "查看订单" },
  "Back to order": { en: "Back to order", zh: "返回订单" },
  "Back to home": { en: "Back to home", zh: "返回首页" },

  /* ── Auth: sign in ─────────────────────────────────────────────── */
  // 注意：涉及品牌的文案一律用 {brand} 占位符 + t(key, { brand: siteName })，
  // 不要在键或译文里写死品牌名 —— 否则运营在后台改站名后这里会残留旧品牌。
  "Sign in to your {brand} account": {
    en: "Sign in to your {brand} account",
    zh: "登录 {brand} 账号",
  },
  "Welcome back to {brand} — please sign in.": {
    en: "Welcome back to {brand} — please sign in.",
    zh: "欢迎回到 {brand}，请登录您的账号。",
  },
  Password: { en: "Password", zh: "密码" },
  "Please enter your password": { en: "Please enter your password", zh: "请输入密码" },
  "Remember me": { en: "Remember me", zh: "记住我" },
  "Remember me (stored locally for 30 days)": {
    en: "Remember me (stored locally for 30 days)",
    zh: "记住我(本地存储 30 天)",
  },
  "Forgot password?": { en: "Forgot password?", zh: "忘记密码？" },
  /** 登录页密码框内右侧的原站文案（比 "Forgot password?" 多一个 your，逐字对齐） */
  "Forgot your password?": { en: "Forgot your password?", zh: "忘记密码？" },
  /** 搜索页左侧筛选栏 aria-label（原站标签**不全大写**，逐字对齐）。
      注意：Relevance / Price, low to high / Price, high to low / Availability / Price / to
      在本字典更靠前处已有同义键，不要在此重复定义（对象字面量重复键会编译报错）。 */
  "Search filters": { en: "Search filters", zh: "搜索筛选" },
  "Price range": { en: "Price range", zh: "价格区间" },
  "Minimum price": { en: "Minimum price", zh: "最低价" },
  "Maximum price": { en: "Maximum price", zh: "最高价" },
  "No account?": { en: "No account?", zh: "没有账号？" },
  "Sign-in failed, please try again later": {
    en: "Sign-in failed, please try again later",
    zh: "登录失败，请稍后重试",
  },
  /* `apiFetch` 在响应体没有可读错误文案时的兜底（HTTP 状态码兜底提示）。
     此前这里在 `lib/fetch-client.ts` 里写死中文「请求失败(${status})」，
     英文站会漏出中文 —— 现统一走字典。 */
  "Request failed ({status})": {
    en: "Request failed ({status})",
    zh: "请求失败（{status}）",
  },
  "Already have an account?": { en: "Already have an account?", zh: "已有账号？" },
  /** 注册页副标题与姓名分栏校验（原站逐字文案） */
  "Please fill in the information below:": {
    en: "Please fill in the information below:",
    zh: "请在下方填写信息：",
  },
  "Please enter your first name": { en: "Please enter your first name", zh: "请输入名字" },
  "Please enter your last name": { en: "Please enter your last name", zh: "请输入姓氏" },

  /* ── Auth: register ───────────────────────────────────────────── */
  Register: { en: "Register", zh: "注册" },
  "Register a {brand} account and start shopping": {
    en: "Register a {brand} account and start shopping",
    zh: "注册 {brand} 账号，开启购物之旅",
  },
  "Password strength": { en: "Password strength", zh: "密码强度" },
  Weak: { en: "Weak", zh: "弱" },
  Fair: { en: "Fair", zh: "中" },
  Strong: { en: "Strong", zh: "强" },
  "Password must be at least 8 characters": {
    en: "Password must be at least 8 characters",
    zh: "密码至少 8 位",
  },
  "Password must contain an uppercase letter": {
    en: "Password must contain an uppercase letter",
    zh: "密码必须包含大写字母",
  },
  "Password must contain a lowercase letter": {
    en: "Password must contain a lowercase letter",
    zh: "密码必须包含小写字母",
  },
  "Password must contain a digit": { en: "Password must contain a digit", zh: "密码必须包含数字" },
  "Password can be at most 72 characters": {
    en: "Password can be at most 72 characters",
    zh: "密码最长 72 位",
  },
  "Passwords do not match": { en: "Passwords do not match", zh: "两次输入的密码不一致" },
  "Registration successful — please sign in": {
    en: "Registration successful — please sign in",
    zh: "注册成功，请登录",
  },
  "Registration failed, please try again later": {
    en: "Registration failed, please try again later",
    zh: "注册失败，请稍后重试",
  },

  /* ── Auth: forgot/reset/verify ────────────────────────────────── */
  /* 找回密码表单的文案**逐字对齐原站** `/account/login#recover`：
     Recover password / Enter your email to recover your password: / Recover
     / Remember your password? / Back to login。
     原站把「登录」与「找回密码」放在同一页锚点切换，本地用同一个
     RecoverForm 组件同时服务页内切换与独立路由 /auth/forgot-password。 */
  "Recover password": { en: "Recover password", zh: "找回密码" },
  "Enter your email to recover your password:": {
    en: "Enter your email to recover your password:",
    zh: "输入邮箱以找回密码：",
  },
  Recover: { en: "Recover", zh: "找回" },
  "Remember your password?": { en: "Remember your password?", zh: "想起密码了？" },
  "Back to login": { en: "Back to login", zh: "返回登录" },
  "Forgot Password": { en: "Forgot Password", zh: "找回密码" },
  "Enter your registered email — we will send you a reset link.": {
    en: "Enter your registered email — we will send you a reset link.",
    zh: "输入注册邮箱，我们将发送重置密码链接。",
  },
  "If that email is registered, a reset email is on its way. If no email service is configured, check the server logs.":
    {
      en: "If that email is registered, a reset email is on its way. If no email service is configured, check the server logs.",
      zh: "若该邮箱已注册，重置邮件已发送，请查收(未配置邮件服务时请查看服务端日志)。",
    },
  "Reset Password": { en: "Reset Password", zh: "重置密码" },
  "Set a new password": { en: "Set a new password", zh: "设置新密码" },
  "New Password": { en: "New Password", zh: "新密码" },
  "Confirm new password": { en: "Confirm new password", zh: "确认新密码" },
  "Please re-enter the new password": {
    en: "Please re-enter the new password",
    zh: "请再次输入新密码",
  },
  "New passwords do not match": { en: "New passwords do not match", zh: "两次输入的新密码不一致" },
  "Password updated": { en: "Password updated", zh: "密码已更新" },
  "Password reset — please sign in with your new password": {
    en: "Password reset — please sign in with your new password",
    zh: "密码重置成功，请使用新密码登录",
  },
  "Reset link is invalid or has expired": {
    en: "Reset link is invalid or has expired",
    zh: "重置链接无效或已过期",
  },
  "Email Verification": { en: "Email Verification", zh: "邮箱验证" },
  "Verify your registered email": { en: "Verify your registered email", zh: "验证您的注册邮箱" },
  "Verifying your email…": { en: "Verifying your email…", zh: "正在验证您的邮箱…" },
  "Email verified": { en: "Email verified", zh: "邮箱验证成功" },
  "Your email has been verified — you can now access all features.": {
    en: "Your email has been verified — you can now access all features.",
    zh: "您的邮箱已通过验证，现在可以正常使用全部功能。",
  },
  "Email verification failed": { en: "Email verification failed", zh: "邮箱验证失败" },
  "Missing verification token — please open this page through the link in the email.": {
    en: "Missing verification token — please open this page through the link in the email.",
    zh: "缺少验证令牌，请从邮件中的链接进入本页。",
  },
  "Verification failed, please try again later": {
    en: "Verification failed, please try again later",
    zh: "验证失败，请稍后重试",
  },
  "Resend verification email": { en: "Resend verification email", zh: "重新发送验证邮件" },
  "Verification email resent — please check your inbox.": {
    en: "Verification email resent — please check your inbox.",
    zh: "验证邮件已重新发送，请查收。",
  },
  "Failed to resend, please try again later": {
    en: "Failed to resend, please try again later",
    zh: "重发失败，请稍后再试",
  },

  /* ── Account: profile ─────────────────────────────────────────── */
  "Profile updated": { en: "Profile updated", zh: "资料已更新" },
  "Failed to save, please try again later": {
    en: "Failed to save, please try again later",
    zh: "保存失败，请稍后重试",
  },
  "Name can be at most 30 characters": {
    en: "Name can be at most 30 characters",
    zh: "昵称最长 30 个字符",
  },
  "Name must be at least 2 characters": {
    en: "Name must be at least 2 characters",
    zh: "昵称至少 2 个字符",
  },
  Save: { en: "Save", zh: "保存" },
  "Failed to load profile info": { en: "Failed to load profile info", zh: "加载个人信息失败" },
  "Delete Account": { en: "Delete Account", zh: "删除账号" },
  "Account deletion is irreversible — proceed with caution.": {
    en: "Account deletion is irreversible — proceed with caution.",
    zh: "删除账号后无法恢复，请谨慎操作。",
  },
  "We will review your request and delete your account and related data after verifying your identity (excluding data we are legally required to keep). This action is irreversible — please proceed carefully.":
    {
      en: "We will review your request and delete your account and related data after verifying your identity (excluding data we are legally required to keep). This action is irreversible — please proceed carefully.",
      zh: "我们将审核您的请求，核实身份后删除您的账户和相关数据(法律法规要求保留的除外)。此操作不可逆,请谨慎操作。",
    },
  "Submit request": { en: "Submit request", zh: "提交申请" },
  "Your deletion request has been received; we'll process it after verification": {
    en: "Your deletion request has been received; we'll process it after verification",
    zh: "已收到您的删除请求，我们将在核实后处理",
  },
  "Failed to submit request, please try again later": {
    en: "Failed to submit request, please try again later",
    zh: "申请提交失败，请稍后重试",
  },
  "Back to sign in": { en: "Back to sign in", zh: "返回登录" },
  "Invalid email format": { en: "Invalid email format", zh: "邮箱格式不正确" },

  /* ── Account: addresses ────────────────────────────────────────── */
  "Add Address": { en: "Add Address", zh: "新增地址" },
  Edit: { en: "Edit", zh: "编辑" },
  "Edit shipping address": { en: "Edit shipping address", zh: "编辑收货地址" },
  Default: { en: "Default", zh: "默认" },
  "Set as default": { en: "Set as default", zh: "设为默认" },
  "Set as default address": { en: "Set as default address", zh: "设为默认收货地址" },
  "Default address set": { en: "Default address set", zh: "已设为默认地址" },
  "Address added": { en: "Address added", zh: "地址已添加" },
  "Address updated": { en: "Address updated", zh: "地址已更新" },
  "Address deleted": { en: "Address deleted", zh: "地址已删除" },
  "No shipping addresses": { en: "No shipping addresses", zh: "暂无收货地址" },
  'No shipping addresses yet. Click \\"Add Address\\" to add one.': {
    en: 'No shipping addresses yet. Click \\"Add Address\\" to add one.',
    zh: "没有收货地址，点击「新增地址」添加。",
  },
  "Enter recipient name": { en: "Enter recipient name", zh: "请输入收件人姓名" },
  "Enter phone number": { en: "Enter phone number", zh: "请输入手机号" },
  "Enter street address": { en: "Enter street address", zh: "请输入详细地址" },
  "Enter city": { en: "Enter city", zh: "请输入城市" },
  "Enter state / province / region": {
    en: "Enter state / province / region",
    zh: "请输入省/市/自治区",
  },
  "Enter ZIP / postal code": { en: "Enter ZIP / postal code", zh: "请输入邮政编码" },
  "Delete the address for {recipientName}?": {
    en: "Delete the address for {recipientName}?",
    zh: "确定删除 {recipientName} 的收货地址吗?",
  },
  "This cannot be undone.": { en: "This cannot be undone.", zh: "删除后无法恢复。" },
  Cancel: { en: "Cancel", zh: "取消" },
  "Failed to delete, please try again later": {
    en: "Failed to delete, please try again later",
    zh: "删除失败，请稍后重试",
  },
  "Failed to set default, please try again later": {
    en: "Failed to set default, please try again later",
    zh: "设置失败，请稍后重试",
  },
  "Failed to load addresses": { en: "Failed to load addresses", zh: "加载地址失败" },

  /* ── Account: orders list ─────────────────────────────────────── */
  "View and manage all your orders": {
    en: "View and manage all your orders",
    zh: "查看与管理您的全部订单",
  },
  All: { en: "All", zh: "全部" },
  Pending: { en: "Pending", zh: "待处理" },
  "Payment pending": { en: "Payment pending", zh: "待支付" },
  Paid: { en: "Paid", zh: "已支付" },
  Shipped: { en: "Shipped", zh: "已发货" },
  Delivered: { en: "Delivered", zh: "已送达" },
  Completed: { en: "Completed", zh: "已完成" },
  Cancelled: { en: "Cancelled", zh: "已取消" },
  Refunded: { en: "Refunded", zh: "已退款" },
  "Refund under review": { en: "Refund under review", zh: "退款审核中" },
  "Refund approved": { en: "Refund approved", zh: "退款已通过" },
  "Refund rejected": { en: "Refund rejected", zh: "退款已驳回" },
  "{n} item(s) not added to cart": {
    en: "{n} item(s) not added to cart",
    zh: "{n} 件未加入购物车",
  },
  "No orders in this status — try another status filter.": {
    en: "No orders in this status — try another status filter.",
    zh: "当前分类下没有订单，去看看其他状态吧。",
  },
  "No orders yet — go pick something you like!": {
    en: "No orders yet — go pick something you like!",
    zh: "您还没有下单记录，快去选购心仪的商品吧。",
  },
  "Order #{orderNumber}": { en: "Order #{orderNumber}", zh: "订单号：{orderNumber}" },
  "Order {orderNumber}": { en: "Order {orderNumber}", zh: "订单 {orderNumber}" },
  "Cancel order": { en: "Cancel order", zh: "取消订单" },
  "Confirm receipt": { en: "Confirm receipt", zh: "确认收货" },
  "Receipt confirmed — thanks for your purchase!": {
    en: "Receipt confirmed — thanks for your purchase!",
    zh: "已确认收货，感谢您的购买！",
  },
  "Failed to cancel, please try again later": {
    en: "Failed to cancel, please try again later",
    zh: "取消失败，请稍后重试",
  },
  "Action failed, please try again later": {
    en: "Action failed, please try again later",
    zh: "操作失败，请稍后重试",
  },

  /* ── Order detail ──────────────────────────────────────────────── */
  "Order detail": { en: "Order detail", zh: "订单详情" },
  "Order progress": { en: "Order progress", zh: "订单进度" },
  "Order placed": { en: "Order placed", zh: "订单创建" },
  "Order cancelled": { en: "Order cancelled", zh: "订单取消" },
  "Request a refund": { en: "Request a refund", zh: "申请退款" },
  Reason: { en: "Reason", zh: "退款原因" },
  "Refund amount": { en: "Refund amount", zh: "退款金额" },
  "Briefly describe why you're requesting a refund": {
    en: "Briefly describe why you're requesting a refund",
    zh: "请简要说明退款原因",
  },
  "Enter refund amount": { en: "Enter refund amount", zh: "请输入退款金额" },
  "Maximum refundable amount (order total)": {
    en: "Maximum refundable amount (order total)",
    zh: "可申请退款的最大金额(订单实付)",
  },
  "Max refund: {max}": { en: "Max refund: {max}", zh: "最多可退 {max}" },
  "Whether the current status allows a refund request": {
    en: "Whether the current status allows a refund request",
    zh: "当前状态是否允许申请退款",
  },
  "Refund request submitted; we'll review it as soon as possible": {
    en: "Refund request submitted; we'll review it as soon as possible",
    zh: "退款申请已提交，我们将尽快审核处理",
  },
  "Max refund:": { en: "Max refund:", zh: "最多可退：" },
  "The refund will be returned through the original payment method once approved. If the order has been shipped, the items must be returned first.":
    {
      en: "The refund will be returned through the original payment method once approved. If the order has been shipped, the items must be returned first.",
      zh: "退款审核通过后将原路退回。若订单已发货，需先退回商品。",
    },
  "Please describe the reason (at least 5 chars)": {
    en: "Please describe the reason (at least 5 chars)",
    zh: "请描述退款原因（至少5个字符）",
  },
  "Delivery info": { en: "Delivery info", zh: "收货信息" },
  "Amount summary": { en: "Amount summary", zh: "金额明细" },
  Logistics: { en: "Logistics", zh: "物流" },
  "View details": { en: "View details", zh: "查看详情" },

  Copy: { en: "Copy", zh: "复制" },
  Copied: { en: "Copied", zh: "已复制" },
  "Spend {minSpend} for free shipping": {
    en: "Spend {minSpend} for free shipping",
    zh: "满 {minSpend} 元免运费",
  },

  /* ── 404 ──────────────────────────────────────────────────────── */
  "Page not found": { en: "Page not found", zh: "页面不存在" },
  "The page you are looking for may have been removed or the URL is incorrect.": {
    en: "The page you are looking for may have been removed or the URL is incorrect.",
    zh: "您访问的页面可能已被删除或地址有误。",
  },

  /* ── Policy page UI ───────────────────────────────────────────── */
  "Last updated": { en: "Last updated", zh: "最近更新" },
  "As last published": { en: "As last published", zh: "以最新公布为准" },

  /* ── Common buttons / misc ─────────────────────────────────────── */
  Unknown: { en: "Unknown", zh: "未知" },
  "Free shipping": { en: "Free shipping", zh: "免运费" },

  /* ── Sign-out toast ────────────────────────────────────────────── */
  "Signed out successfully": { en: "Signed out successfully", zh: "已退出登录" },
  "Sign-out failed, please try again later": {
    en: "Sign-out failed, please try again later",
    zh: "退出登录失败，请稍后重试",
  },

  /* ── Product gallery ───────────────────────────────────────────── */
  "View image {n}": { en: "View image {n}", zh: "查看第 {n} 张图片" },
  "Zoom in on image": { en: "Zoom in on image", zh: "放大查看图片" },
  "Close zoom preview": { en: "Close zoom preview", zh: "关闭放大预览" },

  /* ── Rating stars ─────────────────────────────────────────────── */
  "Rating {n} / 5": { en: "Rating {n} / 5", zh: "评分 {n} / 5" },

  /* ── Cart page ────────────────────────────────────────────────── */
  "Item removed": { en: "Item removed", zh: "已移除商品" },
  "Could not remove, please try again": {
    en: "Could not remove, please try again",
    zh: "移除失败，请稍后重试",
  },
  "Your bag is empty": { en: "Your bag is empty", zh: "购物袋是空的" },
  "Discover something you will love — quality goods for everyday living.": {
    en: "Discover something you will love — quality goods for everyday living.",
    zh: "发现你心仪的好物——精心设计的好品质日常用品。",
  },
  "Browse Products": { en: "Browse Products", zh: "去逛逛商品" },
  "{count} items": { en: "{count} items", zh: "{count} 件商品" },
  "remove this item": { en: "remove this item", zh: "移除该商品" },
  "Applying…": { en: "Applying…", zh: "应用中…" },
  "Calculated at checkout": { en: "Calculated at checkout", zh: "结算时计算" },
  "Estimated total": { en: "Estimated total", zh: "预估合计" },
  "Continue Shopping": { en: "Continue Shopping", zh: "继续购物" },

  /* ── Checkout flow ─────────────────────────────────────────────── */
  "1. Shipping Address": { en: "1. Shipping Address", zh: "1. 收货地址" },
  "2. Shipping method": { en: "2. Shipping method", zh: "2. 配送方式" },
  "4. Order notes (optional)": { en: "4. Order notes (optional)", zh: "4. 订单备注（可选）" },
  "5. Order summary": { en: "5. Order summary", zh: "5. 订单摘要" },
  "Checkout unavailable": { en: "Checkout unavailable", zh: "暂时无法结算" },
  "Your cart is empty or items failed to load — please go back and continue shopping.": {
    en: "Your cart is empty or items failed to load — please go back and continue shopping.",
    zh: "购物车为空，或商品信息加载失败，请返回继续选购。",
  },
  "No shipping address yet — please add one first.": {
    en: "No shipping address yet — please add one first.",
    zh: "没有收货地址，点击右键新增。",
  },
  "Standard shipping (3-5 days)": { en: "Standard shipping (3-5 days)", zh: "标准配送（3-5 天）" },
  "Express shipping (1-2 days)": { en: "Express shipping (1-2 days)", zh: "加急配送（1-2 天）" },
  "Delivery time requests, invoice details, etc. (max 300 chars)": {
    en: "Delivery time requests, invoice details, etc. (max 300 chars)",
    zh: "配送时间要求、发票信息等（最多 300 字）",
  },
  "Place order · {total}": { en: "Place order · {total}", zh: "提交订单 · {total}" },
  "Failed to refresh the address list": {
    en: "Failed to refresh the address list",
    zh: "刷新地址列表失败",
  },
  "Please select a shipping address": {
    en: "Please select a shipping address",
    zh: "请先选择收货地址",
  },
  "Cancelling…": { en: "Cancelling…", zh: "取消中…" },
  "Order pending payment": { en: "Order pending payment", zh: "待支付订单号" },
  "Your order has been paid — we will ship it as soon as possible.": {
    en: "Your order has been paid — we will ship it as soon as possible.",
    zh: "您的订单已支付成功，我们将尽快为您安排发货。",
  },
  "Your order has not been paid yet — complete payment later from My Orders.": {
    en: "Your order has not been paid yet — complete payment later from My Orders.",
    zh: "您的订单尚未支付，可稍后在我的订单中继续支付。",
  },
  "Order #": { en: "Order #", zh: "订单号：" },

  /* ── Auth: extras (login-form / register / forgot / reset / verify — keys not already above) */
  "Sign Up": { en: "Sign Up", zh: "注册" },
  "Sign up": { en: "Sign up", zh: "注册" },
  "Signing up…": { en: "Signing up…", zh: "注册中…" },
  "Create a {brand} account and start shopping.": {
    en: "Create a {brand} account and start shopping.",
    zh: "注册 {brand} 账号，开启购物之旅。",
  },
  "Registration successful!": { en: "Registration successful!", zh: "注册成功！" },
  "2-30 characters": { en: "2-30 characters", zh: "2-30 个字符" },
  "At least 8 chars with upper/lowercase and a digit": {
    en: "At least 8 chars with upper/lowercase and a digit",
    zh: "至少 8 位，含大小写字母与数字",
  },
  "Notice: after registering, you may need to verify your email (if no email service is configured, this is logged server-side and does not affect sign-in).":
    {
      en: "Notice: after registering, you may need to verify your email (if no email service is configured, this is logged server-side and does not affect sign-in).",
      zh: "注册后可能需要验证邮箱（未配置邮件服务时仅记录日志，不影响登录）。",
    },
  "Welcome back, {name}!": { en: "Welcome back, {name}!", zh: "欢迎回来，{name}！" },
  "Test accounts：user@example.com / User@123456 (admin admin@example.com / Admin@123456)": {
    en: "Test accounts：user@example.com / User@123456 (admin admin@example.com / Admin@123456)",
    zh: "测试账号：user@example.com / User@123456 (管理员 admin@example.com / Admin@123456)",
  },
  "Request failed, please try again later": {
    en: "Request failed, please try again later",
    zh: "请求失败，请稍后重试",
  },
  "Send reset email": { en: "Send reset email", zh: "发送重置邮件" },
  "Remember it now?": { en: "Remember it now?", zh: "想起来了？" },
  "Reset failed, please try again later": {
    en: "Reset failed, please try again later",
    zh: "重置失败，请稍后重试",
  },
  "Please enter a new password (8-72 chars with upper/lowercase and a digit).": {
    en: "Please enter a new password (8-72 chars with upper/lowercase and a digit).",
    zh: "请输入新密码（8-72 位，含大小写字母与数字）。",
  },
  "Please enter a new password": { en: "Please enter a new password", zh: "请输入新密码" },
  "Confirm reset": { en: "Confirm reset", zh: "确认重置" },
  "Email verified!": { en: "Email verified!", zh: "邮箱验证成功！" },
  "Verification link invalid or expired — please resend the verification email.": {
    en: "Verification link invalid or expired — please resend the verification email.",
    zh: "验证链接无效或已过期，请重新发送验证邮件。",
  },
  Help: { en: "Help", zh: "帮助" },

  /* ── Home page ────────────────────────────────────────────────── */
  "New Season / 2026": { en: "New Season / 2026", zh: "新年季 / 2026" },
  "Considered goods for": { en: "Considered goods for", zh: "为" },
  "everyday living.": { en: "everyday living.", zh: "日常生活而精选的好物。" },
  "Thoughtfully designed products, responsibly made, built to last.": {
    en: "Thoughtfully designed products, responsibly made, built to last.",
    zh: "精心设计的产品，负责地制造，经久耐用。",
  },
  "Shop All": { en: "Shop All", zh: "全部选购" },
  "Free Shipping": { en: "Free Shipping", zh: "全场包邮" },
  /* 免邮门槛文案：金额必须由调用方传入（后台「免邮门槛」设置），
     不能把 $75 写进字典 —— 否则后台改了门槛、前端文案还是 $75。 */
  "On all orders over {amount}": {
    en: "On all orders over {amount}",
    zh: "{amount} 以上订单",
  },
  "30-Day Returns": { en: "30-Day Returns", zh: "30 天退换" },
  "No questions asked": { en: "No questions asked", zh: "无理由退换" },
  "Responsibly Made": { en: "Responsibly Made", zh: "责任制造" },
  "Built to last": { en: "Built to last", zh: "经久耐用" },
  Curated: { en: "Curated", zh: "精选系列" },
  Collections: { en: "Collections", zh: "主题精选" },
  Explore: { en: "Explore", zh: "去看看" },
  "Everything in store": { en: "Everything in store", zh: "全部好物" },

  /* ── Orders detail / list ──────────────────────────────────────── */
  "Order actions": { en: "Order actions", zh: "订单操作" },
  "Order total": { en: "Order total", zh: "订单总额" },
  "Amount details": { en: "Amount details", zh: "金额明细" },
  "Please pay as soon as possible — unpaid orders are auto-cancelled when they time out.": {
    en: "Please pay as soon as possible — unpaid orders are auto-cancelled when they time out.",
    zh: "请尽快完成支付，超时未支付订单将自动取消。",
  },
  "Download invoice": { en: "Download invoice", zh: "下载发票" },
  "Items list": { en: "Items list", zh: "商品清单" },
  "Shipping address": { en: "Shipping address", zh: "收货地址" },
  "Shipping company: ": { en: "Shipping company: ", zh: "物流公司：" },
  "Tracking No.:": { en: "Tracking No.:", zh: "运单号：" },
  "We will ship as soon as the order is paid": {
    en: "We will ship as soon as the order is paid",
    zh: "订单支付后我们将尽快发货",
  },
  "No tracking info yet — please wait": {
    en: "No tracking info yet — please wait",
    zh: "暂无物流信息，请耐心等待",
  },
  "No orders yet — try another status filter.": {
    en: "No orders yet — try another status filter.",
    zh: "当前状态下没有订单，去试试其他状态吧。",
  },

  /* ── Misc. ────────────────────────────────────────────────────── */
  "Last updated:": { en: "Last updated:", zh: "最近更新：" },
  "Cookie consent cleared — you will be asked again on the next visit": {
    en: "Cookie consent cleared — you will be asked again on the next visit",
    zh: "已清除 Cookie 同意记录，下次访问时将重新询问",
  },
  "Failed to clear — please check your browser privacy settings": {
    en: "Failed to clear — please check your browser privacy settings",
    zh: "清除失败，请检查浏览器隐私设置",
  },
  Tax: { en: "Tax", zh: "税费" },
  "Redirecting...": { en: "Redirecting...", zh: "正在跳转…" },
  "Processing...": { en: "Processing...", zh: "处理中…" },
  Yes: { en: "Yes", zh: "是" },
  No: { en: "No", zh: "否" },

  /* ── keys added 2026-08-21 (account/auth/orders extra) ─────────── */
  "11-digit phone": { en: "11-digit phone", zh: "11 位电话号码" },
  "Account deletion request": { en: "Account deletion request", zh: "账号删除申请" },
  "Account navigation": { en: "Account navigation", zh: "账号中心导航" },
  "Add an address for fast checkout.": {
    en: "Add an address for fast checkout.",
    zh: "添加地址，结算更快捷。",
  },
  "Briefly explain why you want to delete your account (optional)": {
    en: "Briefly explain why you want to delete your account (optional)",
    zh: "简要说明你想删除账号的原因（可选）",
  },
  "Confirm changes": { en: "Confirm changes", zh: "确认修改" },
  "Confirm delete": { en: "Confirm delete", zh: "确认删除" },
  "Current Password": { en: "Current Password", zh: "当前密码" },
  "Current status:": { en: "Current status:", zh: "当前状态：" },
  "Delete address": { en: "Delete address", zh: "删除地址" },
  "Delete this shipping address?": {
    en: "Delete this shipping address?",
    zh: "删除这个收货地址？",
  },
  "District / County": { en: "District / County", zh: "区/县" },
  "Edit address": { en: "Edit address", zh: "编辑地址" },
  "Email (read-only)": { en: "Email (read-only)", zh: "邮箱（只读）" },
  "Enter your name": { en: "Enter your name", zh: "输入你的姓名" },
  "Failed to change, please try again later": {
    en: "Failed to change, please try again later",
    zh: "修改失败，请稍后重试",
  },
  "Failed to submit, please try again later": {
    en: "Failed to submit, please try again later",
    zh: "提交失败，请稍后重试",
  },
  Good: { en: "Good", zh: "好" },
  "No shipping address yet": { en: "No shipping address yet", zh: "暂无收货地址" },
  "Order notes: ": { en: "Order notes: ", zh: "订单备注：" },
  "Password changed — please sign in with your new password": {
    en: "Password changed — please sign in with your new password",
    zh: "密码已修改，请使用新密码登录",
  },
  "Password must be 8-72 chars and include both uppercase and lowercase letters and a digit.": {
    en: "Password must be 8-72 chars and include both uppercase and lowercase letters and a digit.",
    zh: "密码必须 8-72 位，同时含大小写字母和数字。",
  },
  "Please enter your current password": {
    en: "Please enter your current password",
    zh: "请输入当前密码",
  },
  Province: { en: "Province", zh: "省份" },
  "Request account deletion": { en: "Request account deletion", zh: "申请删除账号" },
  "SKU:": { en: "SKU:", zh: "SKU：" },
  "Save address": { en: "Save address", zh: "保存地址" },
  "Save changes": { en: "Save changes", zh: "保存修改" },
  "Saving…": { en: "Saving…", zh: "保存中…" },
  "Sign in": { en: "Sign in", zh: "登录" },
  "Signing in…": { en: "Signing in…", zh: "登录中…" },
  "Street address (at least 5 characters)": {
    en: "Street address (at least 5 characters)",
    zh: "详细地址（至少 5 个字符）",
  },
  "This address will be the default at checkout": {
    en: "This address will be the default at checkout",
    zh: "此地址将在结算时设为默认",
  },
  "This cannot be undone. Delete the address for {name}?": {
    en: "This cannot be undone. Delete the address for {name}?",
    zh: "此操作不可撤销。删除 {name} 的地址？",
  },
  "To change your email, please contact customer support.": {
    en: "To change your email, please contact customer support.",
    zh: "如需修改邮箱，请联系客服。",
  },
  "Update your name. Your email is your sign-in ID and cannot be changed.": {
    en: "Update your name. Your email is your sign-in ID and cannot be changed.",
    zh: "修改你的 姓名。邮箱是登录账号，不可修改。",
  },
  "Used · saved {amount}": { en: "Used · saved {amount}", zh: "已使用 · 已节省 {amount}" },
  "View all": { en: "View all", zh: "查看全部" },
  Bag: { en: "Bag", zh: "购物袋" },
  "Bag, {n} items": { en: "Bag, {n} items", zh: "购物袋，{n} 件" },
  "Search products…": { en: "Search products…", zh: "搜索商品…" },
  "What are you looking for?": { en: "What are you looking for?", zh: "你想找什么？" },
  "Close search": { en: "Close search", zh: "关闭搜索" },
  "Popular searches": { en: "Popular searches", zh: "热门搜索" },
  Apparel: { en: "Apparel", zh: "服饰" },
  Audio: { en: "Audio", zh: "音频" },
  Home: { en: "Home", zh: "家居" },
  Accessories: { en: "Accessories", zh: "配件" },
  "Add To Cart": { en: "Add To Cart", zh: "加入购物袋" },
  "Adding…": { en: "Adding…", zh: "添加中…" },
  "Buy Now": { en: "Buy Now", zh: "立即购买" },
  "Could not add to bag, please try again": {
    en: "Could not add to bag, please try again",
    zh: "无法添加到购物袋，请重试",
  },
  "Could not process, please try again": {
    en: "Could not process, please try again",
    zh: "无法处理，请重试",
  },
  "{n} available": { en: "{n} available", zh: "库存 {n} 件" },
  "{n} sold": { en: "{n} sold", zh: "已售 {n}" },
  "Save {n}%": { en: "Save {n}%", zh: "省 {n}%" },
  Category: { en: "Category", zh: "分类" },
  "No detailed description available.": {
    en: "No detailed description available.",
    zh: "暂无详细描述。",
  },
  "You May Also Like": { en: "You May Also Like", zh: "你可能还喜欢" },
  Recommended: { en: "Recommended", zh: "为你推荐" },
  "Product not found": { en: "Product not found", zh: "商品未找到" },
  "Privacy Policy: How we collect, use, and protect your personal data": {
    en: "Privacy Policy: How we collect, use, and protect your personal data",
    zh: "隐私政策：我们如何收集、使用和保护您的个人数据",
  },
  "Refund Policy: 7-day no-reason returns, refund conditions, and process": {
    en: "Refund Policy: 7-day no-reason returns, refund conditions, and process",
    zh: "退款政策：7 天无理由退货、退款条件和流程",
  },
  "Terms of Service: please read and agree before using our service": {
    en: "Terms of Service: please read and agree before using our service",
    zh: "服务条款：使用服务前请阅读并同意",
  },
  "Cookie Policy: How we use cookies and similar technologies": {
    en: "Cookie Policy: How we use cookies and similar technologies",
    zh: "Cookie 政策：我们如何使用 Cookie 和类似技术",
  },
  "Deletion request in progress": {
    en: "Deletion request in progress",
    zh: "注销申请处理中",
  },
  "We received your deletion request on {date}. Our team will process it within 30 days — your account stays fully usable until then.":
    {
      en: "We received your deletion request on {date}. Our team will process it within 30 days — your account stays fully usable until then.",
      zh: "我们已收到您的注销申请（{date} 提交）。客服将在 30 个自然日内处理，期间您的账户可正常使用。",
    },
  "Withdraw deletion request": {
    en: "Withdraw deletion request",
    zh: "撤回注销申请",
  },
  "Deletion request withdrawn — your account is back to normal": {
    en: "Deletion request withdrawn — your account is back to normal",
    zh: "注销申请已撤回，账户恢复正常",
  },
  "Your deletion request has been received; we will process it after verification": {
    en: "Your deletion request has been received; we will process it after verification",
    zh: "注销申请已收到，核实后我们将处理您的请求",
  },
  "Create your {brand} account and start shopping.": {
    en: "Create your {brand} account and start shopping.",
    zh: "创建 {brand} 账户，即刻开启购物。",
  },
  items: { en: "items", zh: "件商品" },
  "No matching orders": { en: "No matching orders", zh: "没有匹配的订单" },
  to: { en: "to", zh: "至" },
  "Shopping bag": { en: "Shopping bag", zh: "购物袋" },
  "Close bag": { en: "Close bag", zh: "关闭购物袋" },
  "Added to bag": { en: "Added to bag", zh: "已加入购物袋" },
  Previous: { en: "Previous", zh: "上一页" },
  Next: { en: "Next", zh: "下一页" },
  __lang__: { en: "__lang__", zh: "__lang__" },
  "Decrease quantity": { en: "Decrease quantity", zh: "减少数量" },
  "Increase quantity": { en: "Increase quantity", zh: "增加数量" },
  "Refund request submitted; we will review it as soon as possible": {
    en: "Refund request submitted; we will review it as soon as possible",
    zh: "退款申请已提交，我们会尽快审核",
  },
  "Hi {name}": { en: "Hi {name}", zh: "您好，{name}" },

  /* ── Notification center (account/notifications) ──────────────────── */
  Inbox: { en: "Inbox", zh: "收件箱" },
  Notifications: { en: "Notifications", zh: "消息通知" },
  Unread: { en: "Unread", zh: "未读" },
  "Mark all read": { en: "Mark all read", zh: "全部已读" },
  Refresh: { en: "Refresh", zh: "刷新" },
  "You have {n} unread messages": {
    en: "You have {n} unread messages",
    zh: "您有 {n} 条未读消息",
  },
  "All caught up": { en: "All caught up", zh: "您已查看所有消息" },
  "No unread messages": { en: "No unread messages", zh: "没有未读消息" },
  "No messages yet": { en: "No messages yet", zh: "暂无任何消息" },
  "Mark as read": { en: "Mark as read", zh: "标为已读" },
  "Load failed": { en: "Load failed", zh: "加载失败" },
  "Operation failed": { en: "Operation failed", zh: "操作失败" },
  "All marked as read ({n})": {
    en: "All marked as read ({n})",
    zh: "已全部标为已读（{n} 条）",
  },
  Delete: { en: "Delete", zh: "删除" },
  Deleted: { en: "Deleted", zh: "已删除" },
  "Clear read": { en: "Clear read", zh: "清空已读" },
  "Cleared {n} read messages": {
    en: "Cleared {n} read messages",
    zh: "已清空 {n} 条已读消息",
  },

  "Notify me when restocked": { en: "Notify me when restocked", zh: "到货时通知我" },
  "Subscribed — we'll email you on restock": {
    en: "Subscribed — we'll email you on restock",
    zh: "已订阅 — 补货时邮件通知您",
  },
  "Enter your email and we'll notify you when this product is back in stock": {
    en: "Enter your email and we'll notify you when this product is back in stock",
    zh: "输入您的邮箱，商品补货时我们会通知您",
  },
  Subscribe: { en: "Subscribe", zh: "订阅" },

  /* ── 页脚 ──────────────────────────────────────────────────────── */
  Footer: { en: "Footer", zh: "页脚" },
  "Your Privacy Choices": { en: "Your Privacy Choices", zh: "您的隐私选择" },
  /* 无障碍：跳到主内容（此前硬编码在 (shop)/layout.tsx） */
  "Skip to content": { en: "Skip to content", zh: "跳到主要内容" },

  /* ── 补齐此前只有调用、没有词条的键 ────────────────────────────────
     这些 key 早就被 t() 调用，但 DICT 里缺失 → 中文界面会静默漏出英文。
     统一补上，保证 zh 渲染不再回落到英文源串。 */
  "3. Order notes (optional)": { en: "3. Order notes (optional)", zh: "3. 订单备注（选填）" },
  "4. Order summary": { en: "4. Order summary", zh: "4. 订单摘要" },
  "Added {n} item(s) to cart": { en: "Added {n} item(s) to cart", zh: "已加入购物车 {n} 件" },
  "Go to item {n}": { en: "Go to item {n}", zh: "前往第 {n} 件商品" },
  "Order is empty": { en: "Order is empty", zh: "订单为空" },
  "Order not found…": { en: "Order not found…", zh: "未找到订单…" },
  Reorder: { en: "Reorder", zh: "再次购买" },
  "{n} items": { en: "{n} items", zh: "{n} 件商品" },

  /* ── 补齐 2026-09-19 全量审计发现的漏词条键 ──────────────────────────
     审计方式：扫描 src 下所有 t("…") / t('…') 字面量（还原转义后）与 DICT 求差集。
     缺失的后果**不是报错**，而是 zh 界面静默显示英文源串（translate 回退到 key），
     所以这类缺口必须靠自动化守卫，不能靠肉眼。
     该不变量已固化为断言：tests/unit/i18n-keys.test.ts。 */
  "Available Coupons": { en: "Available Coupons", zh: "可用优惠券" },
  "Enter the discount code at checkout to apply": {
    en: "Enter the discount code at checkout to apply",
    zh: "在结算页输入折扣码即可使用",
  },
  "Order not found, please check the order number.": {
    en: "Order not found, please check the order number.",
    zh: "未找到该订单，请核对订单号。",
  },
  "We've emailed you a secure link to view this order.": {
    en: "We've emailed you a secure link to view this order.",
    zh: "我们已向你的邮箱发送了查看此订单的安全链接。",
  },

  /* ── 结账流程（对齐 shop.x.com 结账页：Cart › Information › Shipping › Payment › Review）──
     这些标签此前只有 t() 调用、DICT 里没有词条，中文界面会静默漏出英文。 */
  Information: { en: "Information", zh: "信息" },
  Payment: { en: "Payment", zh: "支付" },
  Review: { en: "Review", zh: "确认" },
  "Order summary": { en: "Order summary", zh: "订单摘要" },
  "Continue to shipping": { en: "Continue to shipping", zh: "继续填写配送信息" },
  "Continue to payment": { en: "Continue to payment", zh: "继续支付" },
  "Return to cart": { en: "Return to cart", zh: "返回购物车" },
  "Calculated at next step": { en: "Calculated at next step", zh: "下一步计算" },
  "Country/Region": { en: "Country/Region", zh: "国家/地区" },
  "First name": { en: "First name", zh: "名" },
  "Last name": { en: "Last name", zh: "姓" },
  State: { en: "State", zh: "省/州" },
  "ZIP code": { en: "ZIP code", zh: "邮政编码" },
  "Save this information for next time": {
    en: "Save this information for next time",
    zh: "保存信息，下次自动填写",
  },
  "Order notes": { en: "Order notes", zh: "订单备注" },
  "Refund policy": { en: "Refund policy", zh: "退款政策" },
  "Privacy policy": { en: "Privacy policy", zh: "隐私政策" },
  "Checkout as guest": { en: "Checkout as guest", zh: "以游客身份结算" },
  "You're checking out as a guest — no account needed.": {
    en: "You're checking out as a guest — no account needed.",
    zh: "当前以游客身份结算，无需注册账号。",
  },
  "We'll email your order confirmation and tracking updates here.": {
    en: "We'll email your order confirmation and tracking updates here.",
    zh: "订单确认与物流通知将发送至此邮箱。",
  },
  "Sign in to use your saved addresses": {
    en: "Sign in to use your saved addresses",
    zh: "登录以使用已保存的收货地址",
  },
  "Please enter your email": { en: "Please enter your email", zh: "请输入邮箱" },
  "Please enter a valid email address": {
    en: "Please enter a valid email address",
    zh: "请输入有效的邮箱地址",
  },
  "Please fill in the shipping address": {
    en: "Please fill in the shipping address",
    zh: "请填写收货地址",
  },
  "Recipient name": { en: "Recipient name", zh: "收货人姓名" },
  "Phone number": { en: "Phone number", zh: "联系电话" },
  "Street address": { en: "Street address", zh: "详细地址" },
  "Apartment, suite, etc. (optional)": {
    en: "Apartment, suite, etc. (optional)",
    zh: "公寓、门牌等（选填）",
  },
  District: { en: "District", zh: "区/县" },
  "Continue to review": { en: "Continue to review", zh: "继续确认订单" },
  "Complete order": { en: "Complete order", zh: "提交订单" },
  Back: { en: "Back", zh: "返回上一步" },
  "Please select a payment method": { en: "Please select a payment method", zh: "请选择支付方式" },
  "Shipping method": { en: "Shipping method", zh: "配送方式" },
  "Order notes (optional)": { en: "Order notes (optional)", zh: "订单备注（选填）" },
  "Add a note": { en: "Add a note", zh: "添加备注" },

  /* ── 折扣码（优惠券）──────────────────────────────────────────────
     券码校验失败的文案由服务端返回原因码，再经 translate() 渲染；
     因此这里的英文串同时充当「服务端错误文案」与「前端提示文案」的单一来源。 */
  "Discount code": { en: "Discount code", zh: "折扣码" },
  "Discount codes": { en: "Discount codes", zh: "折扣码" },
  Discount: { en: "Discount", zh: "折扣" },
  "Enter a discount code": { en: "Enter a discount code", zh: "请输入折扣码" },
  "Discount code applied": { en: "Discount code applied", zh: "折扣码已应用" },
  "Discount code removed": { en: "Discount code removed", zh: "折扣码已移除" },
  "This discount code doesn't exist": {
    en: "This discount code doesn't exist",
    zh: "该折扣码不存在",
  },
  "This discount code is no longer active": {
    en: "This discount code is no longer active",
    zh: "该折扣码已停用",
  },
  "This discount code isn't valid yet": {
    en: "This discount code isn't valid yet",
    zh: "该折扣码尚未生效",
  },
  "This discount code has expired": { en: "This discount code has expired", zh: "该折扣码已过期" },
  "This discount code has reached its usage limit": {
    en: "This discount code has reached its usage limit",
    zh: "该折扣码已达使用上限",
  },
  "You've already used this discount code": {
    en: "You've already used this discount code",
    zh: "您已使用过该折扣码",
  },
  "This discount code can't be applied to your order": {
    en: "This discount code can't be applied to your order",
    zh: "该折扣码不适用于当前订单",
  },
  "Spend {amount} more to use this discount code": {
    en: "Spend {amount} more to use this discount code",
    zh: "再消费 {amount} 即可使用该折扣码",
  },
  "Available discount codes": { en: "Available discount codes", zh: "可用折扣码" },
  "No discount codes available right now": {
    en: "No discount codes available right now",
    zh: "暂无可用折扣码",
  },
  "Copy code": { en: "Copy code", zh: "复制券码" },
  "Ends {date}": { en: "Ends {date}", zh: "{date} 到期" },
  "Save {amount}": { en: "Save {amount}", zh: "立减 {amount}" },
  "{pct}% off": { en: "{pct}% off", zh: "{pct}% 折扣" },
  "Free shipping on your order": { en: "Free shipping on your order", zh: "本单免运费" },
  "Min. spend {amount}": { en: "Min. spend {amount}", zh: "满 {amount} 可用" },
  "Apply a discount code at checkout": {
    en: "Apply a discount code at checkout",
    zh: "结算时可使用折扣码",
  },
  "Shop all products": { en: "Shop all products", zh: "选购全部商品" },

  /* ── 折扣码中心 / 我的折扣码 ───────────────────────────────────── */
  Coupons: { en: "Coupons", zh: "折扣码" },
  "Coupon Center": { en: "Coupon Center", zh: "领券中心" },
  "My Coupons": { en: "My Coupons", zh: "我的折扣码" },
  "Used Coupons": { en: "Used Coupons", zh: "已使用" },
  "You have not used any coupons yet": {
    en: "You have not used any coupons yet",
    zh: "你还没有使用过折扣码",
  },
  "Valid until {date}": { en: "Valid until {date}", zh: "有效期至 {date}" },
  "Coupon code {code} copied": { en: "Coupon code {code} copied", zh: "折扣码 {code} 已复制" },
  "Copy failed — please copy the coupon code manually": {
    en: "Copy failed — please copy the coupon code manually",
    zh: "复制失败，请手动复制折扣码",
  },
};

/** Translate a key for a given lang.
 *  Resolution order per lang:
 *    - `zh` → DICT[key].zh  (fallback to DICT[key].en, then to key)
 *    - `en` → DICT[key].en  (fallback to DICT[key].zh, then to key)
 *  Fallbacks are only used to prevent raw keys from leaking into the UI; every
 *  shipped entry should define both `zh` and `en`. Supports {placeholder}
 *  interpolation: t("Hi {name}", { name: "X" }, lang). */
export function translate(
  key: string,
  lang: Lang,
  params?: Record<string, string | number>,
): string {
  /* Magic key — exposes the current language to help callers (e.g. date-fns locale selection). */
  if (key === "__lang__") return lang;
  const entry = DICT[key];
  let str: string;
  if (lang === "en") {
    str = entry?.en ?? entry?.zh ?? key;
  } else {
    str = entry?.zh ?? entry?.en ?? key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

/** Definition helper — used by lang-provider + lang-server to share the dictionary. */
export function listKeys(): string[] {
  return Object.keys(DICT);
}

/**
 * 语言相关标点 —— 全角/半角的单一事实来源。
 *
 * 为什么需要它：中文用「：、（）」，英文用「:, ()」。这类标点若写死在 JSX 里，
 * 切到英文后页面会混入全角字符（例如 `Estimated shipping：` / `（3-5 天）`），
 * 属于典型的 i18n 泄漏。凡是「把两个片段拼成一句话」的地方都走这里。
 */
export const PUNCT: Record<Lang, { colon: string; list: string; parens: (s: string) => string }> = {
  zh: { colon: "：", list: "、", parens: (s) => `（${s}）` },
  en: { colon: ": ", list: ", ", parens: (s) => `(${s})` },
};

/** 取当前语言的标点集（未知语言按英文处理）。 */
export function punct(lang: Lang) {
  return PUNCT[lang] ?? PUNCT.en;
}

/**
 * Pick a product / category name for the current language.
 * - zh: returns zh name (with en fallback)
 * - en: returns nameEn when available, otherwise name (which may be zh).
 *
 * For pure-English output, callers should provide nameEn when they want
 * en mode to look polished. The fallback is intentional — a Chinese name
 * is still understandable in English UI but never vice versa.
 */
export function pickName(nameZh: string, nameEn: string | null | undefined, lang: Lang): string {
  if (lang === "zh") return nameZh || nameEn || "";
  return nameEn || nameZh || "";
}

/** Same as pickName but with description fallback semantics. */
export function pickDescription(
  descZh: string,
  descEn: string | null | undefined,
  lang: Lang,
): string {
  return lang === "zh" ? descZh || descEn || "" : descEn || descZh || "";
}

/**
 * R4 修复：生成页面级 hreflang alternates。
 * 根 layout 的 alternates 只覆盖首页；子页面（PDP/PLP/search）的 generateMetadata
 * 会覆盖根 layout metadata，导致子页面缺 hreflang。调用此函数补全。
 *
 * @param path 页面路径（如 /products/tee、/search?q=xxx），不含语言前缀
 * @returns Metadata["alternates"] 格式的对象
 */
export function buildAlternates(path: string): {
  languages: Record<string, string>;
  canonical: string;
} {
  const base = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return {
    canonical: `${base}${cleanPath}`,
    languages: {
      en: `${base}${cleanPath}`,
      zh: `${base}/zh${cleanPath}`,
      "x-default": `${base}${cleanPath}`,
    },
  };
}

/**
 * R3 修复：统一语言前缀路径。
 * - zh 模式：路径前加 /zh（如 /products/tee → /zh/products/tee）
 * - en 模式：不加前缀（默认英文）
 * - 已含 /zh 或 /en 前缀的路径不重复添加
 * - 保留 query/hash
 *
 * 用于 product-card、header 等组件的内部链接，避免 /zh 页面内点击跳回英文版。
 */
export function localizePath(path: string, lang: Lang): string {
  if (!path || path.startsWith("http") || path.startsWith("mailto:")) return path;
  // 已含语言前缀则不重复
  if (/^\/(zh|en)(\/|$)/.test(path)) return path;
  if (lang === "zh") return `/zh${path.startsWith("/") ? path : `/${path}`}`;
  return path;
}
