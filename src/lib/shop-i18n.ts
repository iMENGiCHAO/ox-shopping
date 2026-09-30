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
  "Export my data": {
    en: "Export my data",
    zh: "导出我的数据",
  } /* ── Top nav (header) ──────────────────────────────────────────── */,
  Shop: { en: "Shop", zh: "购物" },
  "All Products": { en: "All Products", zh: "全部商品" },
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
  "Enter your email": { en: "Enter your email", zh: "请输入邮箱" },
  "Email address": { en: "Email address", zh: "邮箱地址" },
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
  /* 工具栏上的触发按钮文案（单数）—— 原站 `<1000px` 的 `collection-toolbar__button` */
  Filter: { en: "Filter", zh: "筛选" },
  "In stock only": { en: "In stock only", zh: "仅显示有货" },
  "View results": { en: "View results", zh: "查看结果" },
  "No results found.": { en: "No results found.", zh: "没有找到相关结果。" },
  Suggestions: { en: "Suggestions", zh: "搜索建议" },
  "View all results": { en: "View all results", zh: "查看所有结果" },
  /* 搜索浮层空态的两个集合入口（与集合名一致） */
  "Ox Collection": { en: "Ox Collection", zh: "Ox Collection" },
  "Ox Essentials Collection": { en: "Ox Essentials Collection", zh: "Ox Essentials Collection" },
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
  "item(s)": { en: "item(s)", zh: "件" },
  Profile: { en: "Profile", zh: "个人资料" },
  "Change Password": { en: "Change Password", zh: "修改密码" },
  "Shipping Address": { en: "Shipping Address", zh: "收货地址" },

  /* ── Header cart & search ─────────────────────────────────────── */
  Cart: { en: "Cart", zh: "购物车" },
  "Shopping Bag": { en: "Shopping Bag", zh: "购物袋" },
  Search: { en: "Search", zh: "搜索" },
  "Search products": { en: "Search products", zh: "搜索商品" },
  "Shop now": { en: "Shop now", zh: "立即选购" },

  /* ── Product listing pages ────────────────────────────────────── */
  Products: { en: "Products", zh: "商品" },
  "Sort by": { en: "Sort by", zh: "排序方式" },
  filters: { en: "filters", zh: "筛选" },
  "In stock": { en: "In stock", zh: "有货" },
  "Out of stock": { en: "Out of stock", zh: "缺货" },
  /* 大爷需求：库存即时友好提示——加购时即提示，不等结账 */
  "Only {n} left": { en: "Only {n} left", zh: "仅剩 {n} 件" },
  "No products found in this collection yet.": {
    en: "No products found in this collection yet.",
    zh: "该分类下暂无商品。",
  },
  "No products available yet. Please check back soon.": {
    en: "No products available yet. Please check back soon.",
    zh: "暂无在售商品，敬请期待。",
  },
  "No collections to browse right now.": {
    en: "No collections to browse right now.",
    zh: "暂无可浏览的分类。",
  },
  "Includes reversed {m}": {
    en: "Includes reversed {m}",
    zh: "含已冲正 {m}",
  },
  "Shopping bag is full (max {n} items). Remove some items first.": {
    en: "Shopping bag is full (max {n} items). Remove some items first.",
    zh: "购物车已满（最多 {n} 件商品），请先移除部分商品",
  },
  "Insufficient stock, only {n} left": {
    en: "Insufficient stock, only {n} left",
    zh: "库存不足，当前仅剩 {n} 件",
  },
  "Pre-order": { en: "Pre-order", zh: "预售" },
  "You may also like": { en: "You may also like", zh: "你可能也喜欢" },
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
  /* ── Product detail ───────────────────────────────────────────── */
  Details: { en: "Details", zh: "详情" },
  "Related recommendations": { en: "Related recommendations", zh: "相关推荐" },
  "Add to cart": { en: "Add to cart", zh: "加入购物车" },
  Color: { en: "Color", zh: "颜色" },
  Size: { en: "Size", zh: "尺寸" },
  Storage: { en: "Storage", zh: "存储" },
  Spec: { en: "Spec", zh: "规格" },
  Type: { en: "Type", zh: "类型" },
  Version: { en: "Version", zh: "版本" },
  Variant: { en: "Variant", zh: "规格" },
  Switch: { en: "Switch", zh: "轴体" },
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
  "Necessary only": { en: "Necessary only", zh: "仅必要" },
  "Cookie consent cleared — you'll be asked again on the next visit": {
    en: "Cookie consent cleared — you'll be asked again on the next visit",
    zh: "已清除 Cookie 同意记录，下次访问时将重新询问",
  },
  "Reset cookie consent": { en: "Reset cookie consent", zh: "重置 Cookie 同意" },

  /* ── Cart ─────────────────────────────────────────────────────── */
  "Your cart is empty": { en: "Your cart is empty", zh: "购物车是空的" },
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
  "Copy link": { en: "Copy link", zh: "复制链接" },
  Share: { en: "Share", zh: "分享" },
  WeChat: { en: "WeChat", zh: "微信" },
  Close: { en: "Close", zh: "关闭" },
  "Link copied": { en: "Link copied", zh: "链接已复制" },
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
  "Add a shipping address": { en: "Add a shipping address", zh: "新增收货地址" },
  Contact: { en: "Contact", zh: "联系方式" },
  Recipient: { en: "Recipient", zh: "收件人" },
  Phone: { en: "Phone", zh: "手机号" },
  Address: { en: "Address", zh: "详细地址" },
  City: { en: "City", zh: "城市" },
  Email: { en: "Email", zh: "邮箱" },
  Name: { en: "Name", zh: "姓名" },
  "Order number": { en: "Order number", zh: "订单号" },
  Subject: { en: "Subject", zh: "主题" },
  Message: { en: "Message", zh: "留言内容" },
  "Sending…": { en: "Sending…", zh: "发送中…" },
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
  "Estimated shipping": { en: "Estimated shipping", zh: "预计运费" },
  "Cash on Delivery": { en: "Cash on Delivery", zh: "货到付款" },
  "Pay on delivery:": { en: "Pay on delivery:", zh: "货到付款，到付" },
  /* 结账页运费行 / 运费方式行的「到付」标签（原站此处不带冒号，金额由调用方另行拼接）。 */
  "Pay on delivery": { en: "Pay on delivery", zh: "到付" },
  /* 订单详情页 COD 提示与金额行（货到付款：现金交易、无线上支付环节）。 */
  "Cash on delivery — pay the courier when your order arrives.": {
    en: "Cash on delivery — pay the courier when your order arrives.",
    zh: "货到付款——订单送达时请向配送员支付现金。",
  },
  "Due on delivery (cash)": { en: "Due on delivery (cash)", zh: "送达应付（现金）" },
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
  Password: { en: "Password", zh: "密码" },
  "Please enter your password": {
    en: "Please enter your password",
    zh: "请输入密码",
  } /** 登录页密码框内右侧的原站文案（比 "Forgot password?" 多一个 your，逐字对齐） */,
  "Forgot your password?": { en: "Forgot your password?", zh: "忘记密码？" },
  /** 搜索页左侧筛选栏 aria-label（原站标签**不全大写**，逐字对齐）。
      注意：Relevance / Price, low to high / Price, high to low / Availability / Price / to
      在本字典更靠前处已有同义键，不要在此重复定义（对象字面量重复键会编译报错）。 */
  "Search filters": { en: "Search filters", zh: "搜索筛选" },
  "Price range": { en: "Price range", zh: "价格区间" },
  "Minimum price": { en: "Minimum price", zh: "最低价" },
  "Maximum price": { en: "Maximum price", zh: "最高价" },
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
  "Set a new password": { en: "Set a new password", zh: "设置新密码" },
  "New Password": { en: "New Password", zh: "新密码" },
  "Confirm new password": { en: "Confirm new password", zh: "确认新密码" },
  "Please re-enter the new password": {
    en: "Please re-enter the new password",
    zh: "请再次输入新密码",
  },
  "New passwords do not match": { en: "New passwords do not match", zh: "两次输入的新密码不一致" },
  "Password updated": { en: "Password updated", zh: "密码已更新" },
  /* ── 找回密码（B-2 人工审批流）+ 强制改密 ──────────────────────────
     流程：填邮箱提交申请 → 后台审批 → 邮件下发临时密码 → 首登强制改密。
     文案必须把「需要等管理员审核」讲清楚，否则用户会以为邮件马上就到，
     转头去点第二次提交（反而被限流挡下）。 */
  "Your recovery request has been submitted. An administrator will review it, then email you a temporary password.":
    {
      en: "Your recovery request has been submitted. An administrator will review it, then email you a temporary password.",
      zh: "找回密码申请已提交。管理员审核通过后，我们会将临时密码发送到您的邮箱，请耐心等待。",
    },
  "Temporary password": { en: "Temporary password", zh: "临时密码" },
  "Your temporary password has been sent to your email. Enter it below and choose a new password to continue.":
    {
      en: "Your temporary password has been sent to your email. Enter it below and choose a new password to continue.",
      zh: "临时密码已发送到您的邮箱。请在下方输入临时密码，并设置一个新密码后继续。",
    },
  "Signed in as": { en: "Signed in as", zh: "当前账号" },
  "Update password": { en: "Update password", zh: "更新密码" },
  "Update failed, please try again later": {
    en: "Update failed, please try again later",
    zh: "更新失败，请稍后重试",
  },
  "The new password must be different from the current password": {
    en: "The new password must be different from the current password",
    zh: "新密码不能与当前密码相同",
  },
  "No password change required": { en: "No password change required", zh: "无需修改密码" },
  "Your password was already updated — you can continue shopping.": {
    en: "Your password was already updated — you can continue shopping.",
    zh: "您的密码已更新，可以继续购物了。",
  },
  "Sign out": { en: "Sign out", zh: "退出登录" },
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
  "We will review your request and delete your account and related data after verifying your identity (excluding data we are legally required to keep). This action is irreversible — please proceed carefully.":
    {
      en: "We will review your request and delete your account and related data after verifying your identity (excluding data we are legally required to keep). This action is irreversible — please proceed carefully.",
      zh: "我们将审核您的请求，核实身份后删除您的账户和相关数据(法律法规要求保留的除外)。此操作不可逆,请谨慎操作。",
    },
  "Submit request": { en: "Submit request", zh: "提交申请" },
  "Failed to submit request, please try again later": {
    en: "Failed to submit request, please try again later",
    zh: "申请提交失败，请稍后重试",
  },
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
  Logistics: { en: "Logistics", zh: "物流" },
  "View details": { en: "View details", zh: "查看详情" },

  Copy: { en: "Copy", zh: "复制" },
  Copied: { en: "Copied", zh: "已复制" },
  /* ── 404 ────────────────────────────────────────────────────────
     文案**逐字对齐原站**（2026-09-20 取证 `/this-page-does-not-exist-404`）：
     H1 `404` + 下面这句 + 按钮 `Continue shopping`（→ `/collections/all`）。 */
  "We could not find the page you were looking for. Please use the navigation or the button below to go back to our website.":
    {
      en: "We could not find the page you were looking for. Please use the navigation or the button below to go back to our website.",
      zh: "我们找不到您要访问的页面。请使用顶部导航，或点击下方按钮继续购物。",
    } /* ── Policy page UI ───────────────────────────────────────────── */,
  "Last updated": { en: "Last updated", zh: "最近更新" },
  "As last published": { en: "As last published", zh: "以最新公布为准" },

  /* ── Common buttons / misc ─────────────────────────────────────── */
  Unknown: { en: "Unknown", zh: "未知" },
  "Free shipping": { en: "Free shipping", zh: "免运费" },
  "Sign-out failed, please try again later": {
    en: "Sign-out failed, please try again later",
    zh: "退出登录失败，请稍后重试",
  },
  "Zoom in on image": { en: "Zoom in on image", zh: "放大查看图片" },
  "Close zoom preview": { en: "Close zoom preview", zh: "关闭放大预览" },
  /* ── Cart page ────────────────────────────────────────────────── */
  "Item removed": { en: "Item removed", zh: "已移除商品" },
  "Could not remove, please try again": {
    en: "Could not remove, please try again",
    zh: "移除失败，请稍后重试",
  },
  "Your bag is empty": { en: "Your bag is empty", zh: "购物袋是空的" },
  "Browse Products": { en: "Browse Products", zh: "去逛逛商品" },
  "Continue Shopping": { en: "Continue Shopping", zh: "继续购物" },
  "Checkout unavailable": { en: "Checkout unavailable", zh: "暂时无法结算" },
  "Your cart is empty or items failed to load — please go back and continue shopping.": {
    en: "Your cart is empty or items failed to load — please go back and continue shopping.",
    zh: "购物车为空，或商品信息加载失败，请返回继续选购。",
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
  "Registration successful!": { en: "Registration successful!", zh: "注册成功！" },
  "Welcome back, {name}!": { en: "Welcome back, {name}!", zh: "欢迎回来，{name}！" },
  "Request failed, please try again later": {
    en: "Request failed, please try again later",
    zh: "请求失败，请稍后重试",
  },
  "Please enter a new password (8-72 chars with upper/lowercase and a digit).": {
    en: "Please enter a new password (8-72 chars with upper/lowercase and a digit).",
    zh: "请输入新密码（8-72 位，含大小写字母与数字）。",
  },
  "Please enter a new password": { en: "Please enter a new password", zh: "请输入新密码" },
  "Email verified!": { en: "Email verified!", zh: "邮箱验证成功！" },
  "Verification link invalid or expired — please resend the verification email.": {
    en: "Verification link invalid or expired — please resend the verification email.",
    zh: "验证链接无效或已过期，请重新发送验证邮件。",
  },
  Help: { en: "Help", zh: "帮助" },
  "Shop All": { en: "Shop All", zh: "全部选购" },
  "Free Shipping": {
    en: "Free Shipping",
    zh: "全场包邮",
  } /* 集合索引页的 `<title>` —— 原站英文就是 `Collections`（H1 是 `All collections`，两者不同）。
     中文与 H1 的「全部分类」保持一致：此前这条的 zh 是「主题精选」（那是给别的语境用的），
     用作索引页标题会语义错位。 */,
  Collections: {
    en: "Collections",
    zh: "全部分类",
  } /* ── Orders detail / list ──────────────────────────────────────── */,
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
  /* ── Misc. ────────────────────────────────────────────────────── */
  "Last updated:": { en: "Last updated:", zh: "最近更新：" },
  "Failed to clear — please check your browser privacy settings": {
    en: "Failed to clear — please check your browser privacy settings",
    zh: "清除失败，请检查浏览器隐私设置",
  },
  Tax: { en: "Tax", zh: "税费" },
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
  "Update your name. Your email is your sign-in ID and cannot be changed.": {
    en: "Update your name. Your email is your sign-in ID and cannot be changed.",
    zh: "修改你的 姓名。邮箱是登录账号，不可修改。",
  },
  "Used · saved {amount}": { en: "Used · saved {amount}", zh: "已使用 · 已节省 {amount}" },
  "View all": { en: "View all", zh: "查看全部" },
  Bag: { en: "Bag", zh: "购物袋" },
  "Bag, {n} items": { en: "Bag, {n} items", zh: "购物袋，{n} 件" },
  "Close search": { en: "Close search", zh: "关闭搜索" },
  Home: { en: "Home", zh: "家居" },
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
  Category: { en: "Category", zh: "分类" },
  "Product not found": { en: "Product not found", zh: "商品未找到" },
  "Privacy Policy: How we collect, use, and protect your personal data": {
    en: "Privacy Policy: How we collect, use, and protect your personal data",
    zh: "隐私政策：我们如何收集、使用和保护您的个人数据",
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
  } /* ── 页脚 ──────────────────────────────────────────────────────── */,
  Footer: { en: "Footer", zh: "页脚" },
  Support: { en: "Support", zh: "客服" },
  "Your Privacy Choices": { en: "Your Privacy Choices", zh: "您的隐私选择" },
  /* 无障碍：跳到主内容（此前硬编码在 (shop)/layout.tsx） */
  "Skip to content": { en: "Skip to content", zh: "跳到主要内容" },
  "Added {n} item(s) to cart": { en: "Added {n} item(s) to cart", zh: "已加入购物车 {n} 件" },
  "Go to item {n}": { en: "Go to item {n}", zh: "前往第 {n} 件商品" },
  "Order is empty": { en: "Order is empty", zh: "订单为空" },
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

  /* ── 结账流程（对齐 上游参考站 结账页：Cart › Information › Shipping › Payment › Review）──
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
  "We'll email your order confirmation and tracking updates here.": {
    en: "We'll email your order confirmation and tracking updates here.",
    zh: "订单确认与物流通知将发送至此邮箱。",
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
  Discount: { en: "Discount", zh: "折扣" },
  "Enter a discount code": { en: "Enter a discount code", zh: "请输入折扣码" },
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
  "No discount codes available right now": {
    en: "No discount codes available right now",
    zh: "暂无可用折扣码",
  },
  "Copy code": { en: "Copy code", zh: "复制券码" },
  "Save {amount}": { en: "Save {amount}", zh: "立减 {amount}" },
  "{pct}% off": { en: "{pct}% off", zh: "{pct}% 折扣" },
  "Free shipping on your order": { en: "Free shipping on your order", zh: "本单免运费" },
  "Min. spend {amount}": { en: "Min. spend {amount}", zh: "满 {amount} 可用" },
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

  /* ── 分销（个人中心 · 我的推广） ───────────────────────────────── */
  /* ── 分销中心（独立外壳，大爷要求不与原站搅在一起） ───────────── */
  "Distribution center": { en: "Distribution center", zh: "分销中心" },
  "Track your referrals, commission and payouts in one place.": {
    en: "Track your referrals, commission and payouts in one place.",
    zh: "推广、佣金与提现，都在这里统一查看。",
  },
  Overview: { en: "Overview", zh: "概览" },
  "My Team": { en: "My Team", zh: "我的团队" },
  Commissions: { en: "Commissions", zh: "佣金明细" },
  "Share your link, earn commission": {
    en: "Share your link, earn commission",
    zh: "分享你的专属链接，赚取佣金",
  },
  "Anyone who registers or places an order through your link is linked to you — repeat purchases count too.":
    {
      en: "Anyone who registers or places an order through your link is linked to you — repeat purchases count too.",
      zh: "有人通过你的链接注册或下单，就会一直归属你——他之后的复购也算你的业绩。",
    },
  "Open distribution center": { en: "Open distribution center", zh: "进入分销中心" },
  "Total orders": { en: "Total orders", zh: "累计订单" },
  "In progress": { en: "In progress", zh: "进行中" },
  "Recent orders": { en: "Recent orders", zh: "最近订单" },
  "No orders yet": { en: "No orders yet", zh: "还没有订单" },
  "How it works": {
    en: "How it works",
    zh: "规则说明",
  },
  "Fixed amount per order": { en: "Fixed amount per order", zh: "每单固定金额" },
  "Download poster": { en: "Download poster", zh: "下载推广海报" },
  "Distributor tiers": { en: "Distributor tiers", zh: "分销商等级" },
  "Some rates depend on your distributor tier: a tier-specific rule replaces the general rate for that level. Your tier is shown in the distribution center.":
    {
      en: "Some rates depend on your distributor tier: a tier-specific rule replaces the general rate for that level. Your tier is shown in the distribution center.",
      zh: "部分比例与你的分销商等级有关：等级专用规则会替代该层级的通用比例。你的等级可在分销中心查看。",
    },
  "Payee legal name": { en: "Payee legal name", zh: "收款人实名" },
  "Must match the receiving account holder": {
    en: "Must match the receiving account holder",
    zh: "需与收款账户开户人一致",
  },
  "Payout method": { en: "Payout method", zh: "收款方式" },
  Alipay: { en: "Alipay", zh: "支付宝" },
  "WeChat Pay": { en: "WeChat Pay", zh: "微信" },
  "Bank transfer": { en: "Bank transfer", zh: "银行转账" },
  Other: { en: "Other", zh: "其他" },
  "I have read and agree to the": { en: "I have read and agree to the", zh: "我已阅读并同意" },
  "— commission, settlement and withdrawal rules.": {
    en: "— commission, settlement and withdrawal rules.",
    zh: "——佣金、结算与提现规则。",
  },
  "How you earn": {
    en: "How you earn",
    zh: "你如何获得佣金",
  },
  "Share your link. When someone signs up or places an order through it, that customer is linked to you permanently — and you earn commission on their real, paid orders.":
    {
      en: "Share your link. When someone signs up or places an order through it, that customer is linked to you permanently — and you earn commission on their real, paid orders.",
      zh: "分享你的专属链接：有人通过它注册或下单，这位客户就永久归属你——他真实支付的订单会产生你的佣金。",
    },
  "1. Who counts as your customer": {
    en: "1. Who counts as your customer",
    zh: "一、谁算你的客户",
  },
  "Binding moment": {
    en: "Binding moment",
    zh: "绑定时机",
  },
  "Whenever someone registers through your link, they are linked to you.": {
    en: "Whenever someone registers through your link, they are linked to you.",
    zh: "有人通过你的链接注册，即与你绑定。",
  },
  "The link is only recorded at first order — a registration alone does not bind.": {
    en: "The link is only recorded at first order — a registration alone does not bind.",
    zh: "链接仅在首次下单时生效，只注册不绑定。",
  },
  "Repeat purchases": {
    en: "Repeat purchases",
    zh: "复购归属",
  },
  "Every later order counts for you automatically, even if the customer orders without your link.":
    {
      en: "Every later order counts for you automatically, even if the customer orders without your link.",
      zh: "他之后的每一次下单都算你的业绩，即使他不通过你的链接进入。",
    },
  "Not transferable": {
    en: "Not transferable",
    zh: "不可抢绑",
  },
  "The platform has enabled re-binding: a customer can be moved to another distributor under review.":
    {
      en: "The platform has enabled re-binding: a customer can be moved to another distributor under review.",
      zh: "平台已开启换绑：客户经审核后可转移到其他分销商名下。",
    },
  "Once bound, no other distributor can take the customer away — first bind wins permanently.": {
    en: "Once bound, no other distributor can take the customer away — first bind wins permanently.",
    zh: "一旦绑定，其他分销商无法抢走该客户——首次绑定永久有效。",
  },
  "Organic customers": {
    en: "Organic customers",
    zh: "自然流量",
  },
  "Customers who arrive without any referral link belong to nobody and generate no commission.": {
    en: "Customers who arrive without any referral link belong to nobody and generate no commission.",
    zh: "没有通过任何推广链接来的客户不归属任何人，也不产生佣金。",
  },
  "Attribution window": {
    en: "Attribution window",
    zh: "归因有效期",
  },
  "A referral link identifies the referrer for {days} days after it is clicked.": {
    en: "A referral link identifies the referrer for {days} days after it is clicked.",
    zh: "推广链接在点击后 {days} 天内有效。",
  },
  "A referral link never expires until the customer is bound.": {
    en: "A referral link never expires until the customer is bound.",
    zh: "推广链接在客户完成绑定前长期有效。",
  },
  "2. How commission is calculated": {
    en: "2. How commission is calculated",
    zh: "二、佣金如何计算",
  },
  "Commission base": {
    en: "Commission base",
    zh: "计佣基数",
  },
  "The goods actually paid on an order (subtotal minus discounts). Shipping and tax are never included.":
    {
      en: "The goods actually paid on an order (subtotal minus discounts). Shipping and tax are never included.",
      zh: "订单中商品的实付金额（小计减折扣），运费与税费不计入。",
    },
  Levels: {
    en: "Levels",
    zh: "返佣层级",
  },
  "Commission is paid up the chain. Only the first {levels} levels are paid; higher levels are still recorded but earn nothing.":
    {
      en: "Commission is paid up the chain. Only the first {levels} levels are paid; higher levels are still recorded but earn nothing.",
      zh: "佣金沿关系链逐级分配：只返前 {levels} 级，更上层级仅记录关系、不返佣。",
    },
  "No commission rules are configured yet — please contact support.": {
    en: "No commission rules are configured yet — please contact support.",
    zh: "尚未配置佣金规则，请联系客服。",
  },
  "your direct customer": {
    en: "your direct customer",
    zh: "你的直接客户",
  },
  "Total cap": {
    en: "Total cap",
    zh: "总比例上限",
  },
  "All levels combined never exceed {cap}% of an order — the platform configures this to stay within gross margin.":
    {
      en: "All levels combined never exceed {cap}% of an order — the platform configures this to stay within gross margin.",
      zh: "所有层级合计不超过订单金额的 {cap}%，平台据此控制在毛利范围内。",
    },
  "currently configured total": {
    en: "currently configured total",
    zh: "当前配置合计",
  },
  "Product rules": {
    en: "Product rules",
    zh: "商品级规则",
  },
  "Some categories or products have their own rates; those override the global rates above.": {
    en: "Some categories or products have their own rates; those override the global rates above.",
    zh: "部分分类或商品设有单独比例，优先于上面的全局比例。",
  },
  "Your own orders": {
    en: "Your own orders",
    zh: "自购",
  },
  "Your own purchases can also earn commission.": {
    en: "Your own purchases can also earn commission.",
    zh: "你自己下单也可获得佣金。",
  },
  "You do not earn level-1 commission on your own purchases.": {
    en: "You do not earn level-1 commission on your own purchases.",
    zh: "你自己下单不拿一级佣金。",
  },
  "Your upline still earns on your purchases.": {
    en: "Your upline still earns on your purchases.",
    zh: "你的上级仍可从你的订单获得佣金。",
  },
  "Your upline does not earn on your purchases either.": {
    en: "Your upline does not earn on your purchases either.",
    zh: "你的上级也不从你的订单获得佣金。",
  },
  "3. When commission becomes withdrawable": {
    en: "3. When commission becomes withdrawable",
    zh: "三、佣金何时可提现",
  },
  "Paid order": {
    en: "Paid order",
    zh: "订单支付",
  },
  "As soon as an order is paid, the commission is recorded as pending.": {
    en: "As soon as an order is paid, the commission is recorded as pending.",
    zh: "订单一经支付，佣金即记为「在途」。",
  },
  "Once the buyer confirms delivery — or {days} days after payment — the commission becomes withdrawable.":
    {
      en: "Once the buyer confirms delivery — or {days} days after payment — the commission becomes withdrawable.",
      zh: "买家确认收货后（或支付满 {days} 天自动）转为可提现。",
    },
  Refunds: {
    en: "Refunds",
    zh: "退款冲正",
  },
  "If the order is refunded or cancelled, the commission is reversed. Amounts already withdrawable are deducted back from your balance.":
    {
      en: "If the order is refunded or cancelled, the commission is reversed. Amounts already withdrawable are deducted back from your balance.",
      zh: "订单退款或取消时佣金冲正；已转为可提现的部分会从余额中扣回。",
    },
  "4. Withdrawals": {
    en: "4. Withdrawals",
    zh: "四、提现",
  },
  Minimum: {
    en: "Minimum",
    zh: "起提金额",
  },
  "The minimum withdrawal is {amount}.": {
    en: "The minimum withdrawal is {amount}.",
    zh: "最低提现金额为 {amount}。",
  },
  Process: {
    en: "Process",
    zh: "流程",
  },
  "Submit a request → the platform reviews it → the payout is made offline and marked as paid.": {
    en: "Submit a request → the platform reviews it → the payout is made offline and marked as paid.",
    zh: "提交申请 → 平台审核 → 线下打款并标记已打款。",
  },
  "One at a time": {
    en: "One at a time",
    zh: "在途限制",
  },
  "Only one withdrawal request can be in progress at a time.": {
    en: "Only one withdrawal request can be in progress at a time.",
    zh: "同一时间只能有一笔在途提现申请。",
  },
  "5. Fair play": {
    en: "5. Fair play",
    zh: "五、合规与公平",
  },
  "Real orders only": {
    en: "Real orders only",
    zh: "只按真实订单",
  },
  "Commission is only ever generated by real paid orders. There is no bonus for recruiting people, and never any fee to join.":
    {
      en: "Commission is only ever generated by real paid orders. There is no bonus for recruiting people, and never any fee to join.",
      zh: "佣金只来自真实已支付的订单；发展下线不发固定奖金，也不需要缴纳任何加盟费用。",
    },
  "No self-dealing": {
    en: "No self-dealing",
    zh: "禁止自买自返与刷单",
  },
  "Faking orders, buying through your own link to farm commission, or bulk-registering accounts will have commission cancelled and the account banned.":
    {
      en: "Faking orders, buying through your own link to farm commission, or bulk-registering accounts will have commission cancelled and the account banned.",
      zh: "伪造订单、自我下单套取佣金、批量注册账号等行为将被取消佣金并封禁账号。",
    },
  "Data privacy": {
    en: "Data privacy",
    zh: "数据与隐私",
  },
  "You see your own team's orders only, with phone numbers and addresses masked. Full data is available to the platform alone.":
    {
      en: "You see your own team's orders only, with phone numbers and addresses masked. Full data is available to the platform alone.",
      zh: "你只能看到自己团队的订单，且手机号与地址均已脱敏；完整数据仅平台可见。",
    },
  "Change sign-in email": { en: "Change sign-in email", zh: "修改登录邮箱" },
  "Current sign-in email": { en: "Current sign-in email", zh: "当前登录邮箱" },
  "New email": { en: "New email", zh: "新邮箱" },
  "Current password": { en: "Current password", zh: "当前密码" },
  "Enter your current password to confirm": {
    en: "Enter your current password to confirm",
    zh: "请输入当前密码以确认",
  },
  "Please enter a valid new email address": {
    en: "Please enter a valid new email address",
    zh: "请输入有效的新邮箱地址",
  },
  "Sign-in email updated — other devices will need to sign in again with the new email": {
    en: "Sign-in email updated — other devices will need to sign in again with the new email",
    zh: "登录邮箱已更新——其他设备需要用新邮箱重新登录",
  },
  "Failed to update, please try again later": {
    en: "Failed to update, please try again later",
    zh: "更新失败，请稍后重试",
  },

  "Your sign-in email is your account ID. Changes require your current password; once updated, you'll be signed out on other devices and must sign in again with the new email.":
    {
      en: "Your sign-in email is your account ID. Changes require your current password; once updated, you'll be signed out on other devices and must sign in again with the new email.",
      zh: "登录邮箱就是你的账号 ID。修改需要输入当前密码；更新后其他设备会被登出，需要用新邮箱重新登录。",
    },
  "To change your sign-in email, use the Change sign-in email section below.": {
    en: "To change your sign-in email, use the Change sign-in email section below.",
    zh: "如需更换登录邮箱，请使用下方「修改登录邮箱」卡片。",
  },
  "Enter admin console": { en: "Enter admin console", zh: "进入管理后台" },
  "You are signed in with a staff account.": {
    en: "You are signed in with a staff account.",
    zh: "当前登录的是员工账号。",
  },
  "Open admin console": { en: "Open admin console", zh: "打开管理后台" },
  "Copy failed, please copy manually": {
    en: "Copy failed, please copy manually",
    zh: "复制失败，请手动复制",
  },
  "You are a distributor now — your commission is accruing.": {
    en: "You are a distributor now — your commission is accruing.",
    zh: "你已成为分销商，佣金已在统计中。",
  },
  Promote: { en: "Promote", zh: "推广" },
  "Become a distributor": { en: "Become a distributor", zh: "成为分销商" },
  "Share your link — when someone signs up or orders through it, you become a distributor automatically.":
    {
      en: "Share your link — when someone signs up or orders through it, you become a distributor automatically.",
      zh: "分享你的推广链接：只要有人通过它注册或下单，你就会自动成为分销商。",
    },
  "Available balance": { en: "Available balance", zh: "可提现余额" },
  Frozen: { en: "Frozen", zh: "冻结中" },
  "Total settled": { en: "Total settled", zh: "累计已结算" },
  "Pending commission": { en: "Pending commission", zh: "在途佣金" },
  "My promo code": { en: "My promo code", zh: "我的推广码" },
  "Invite link": { en: "Invite link", zh: "邀请链接" },
  "Promotion QR code": { en: "Promotion QR code", zh: "推广二维码" },
  "Copy invite code": { en: "Copy code", zh: "复制推广码" },
  "Scan to shop on {brand}": { en: "Scan to shop on {brand}", zh: "扫码逛 {brand}" },
  "Every scan, signup and order through this card ties to your account — paid orders accrue commission.":
    {
      en: "Every scan, signup and order through this card ties to your account — paid orders accrue commission.",
      zh: "扫此码注册或下单的顾客都会归到你名下，其支付订单为你产生佣金。",
    },
  "Sharing is not supported here — link copied": {
    en: "Sharing is not supported here — link copied",
    zh: "当前环境不支持分享，已复制链接",
  },
  "Team overview": { en: "Team overview", zh: "团队概览" },
  "Direct customers": { en: "Direct customers", zh: "直接客户" },
  "Team size": { en: "Team size", zh: "团队人数" },
  "Promotion tools": { en: "Promotion tools", zh: "推广工具" },
  "Customers you personally referred.": {
    en: "Customers you personally referred.",
    zh: "你亲自邀请来的客户。",
  },
  "Orders from your direct customers.": {
    en: "Orders from your direct customers.",
    zh: "直接客户产生的订单。",
  },
  "People who signed up through your link.": {
    en: "People who signed up through your link.",
    zh: "通过你的链接注册的人。",
  },
  "Every commission you have earned.": {
    en: "Every commission you have earned.",
    zh: "你赚到的每一笔佣金。",
  },
  "Request a payout and track its status.": {
    en: "Request a payout and track its status.",
    zh: "申请提现并查看处理进度。",
  },
  "Daily performance of your whole team.": {
    en: "Daily performance of your whole team.",
    zh: "整个团队的每日业绩。",
  },
  "Copy failed": { en: "Copy failed", zh: "复制失败，请手动复制" },

  /* ── 分销 · 我的客户 / 来源 ────────────────────────────────────── */
  "My Customers": { en: "My Customers", zh: "我的客户" },
  Customer: { en: "Customer", zh: "客户" },
  Customers: { en: "Customers", zh: "客户数" },
  Source: { en: "Source", zh: "来源" },
  "Bound at": { en: "Bound at", zh: "绑定时间" },
  "Total spent": { en: "Total spent", zh: "累计消费" },
  "My commission": { en: "My commission", zh: "我的佣金" },
  "Search by nickname or email": { en: "Search by nickname or email", zh: "按昵称或邮箱搜索" },
  "No customers yet": { en: "No customers yet", zh: "还没有客户" },
  "No matching customers": { en: "No matching customers", zh: "没有匹配的客户" },
  "Try another keyword.": { en: "Try another keyword.", zh: "换个关键词试试。" },
  "Share your promotion link to get your first customer.": {
    en: "Share your promotion link to get your first customer.",
    zh: "分享推广链接，邀请你的第一位客户。",
  },
  Registered: { en: "Registered", zh: "注册绑定" },
  "First order": { en: "First order", zh: "首次下单" },
  Link: { en: "Link", zh: "推广链接" },
  "QR code": { en: "QR code", zh: "二维码" },
  "Invite code": { en: "Invite code", zh: "邀请码" },

  /* ── 分销 · 我的订单 ───────────────────────────────────────────── */
  Buyer: { en: "Buyer", zh: "买家" },
  Region: { en: "Region", zh: "地区" },
  Status: { en: "Status", zh: "状态" },
  Amount: { en: "Amount", zh: "金额" },
  Time: { en: "Time", zh: "时间" },
  "Only orders from your direct customers are listed — sub-team orders are summarised only.": {
    en: "Only orders from your direct customers are listed — sub-team orders are summarised only.",
    zh: "这里只列出直接客户的订单；下级团队的订单仅做汇总。",
  },
  "No orders from your direct customers yet.": {
    en: "No orders from your direct customers yet.",
    zh: "直接客户还没有产生订单。",
  },

  /* ── 分销 · 我的下级 ───────────────────────────────────────────── */
  "My Subordinates": { en: "My Subordinates", zh: "我的下级" },
  "Direct subordinates": { en: "Direct subordinates", zh: "直接下级" },
  "Indirect subordinates": { en: "Indirect subordinates", zh: "间接下级" },
  "Joined at": { en: "Joined at", zh: "加入时间" },
  Distributor: { en: "Distributor", zh: "分销商" },
  "You have no direct subordinates yet.": {
    en: "You have no direct subordinates yet.",
    zh: "你还没有直接下级。",
  },
  "Indirect subordinates are summarised only — their customer and order details are not shown.": {
    en: "Indirect subordinates are summarised only — their customer and order details are not shown.",
    zh: "间接下级只做汇总，不展示其客户与订单明细。",
  },

  /* ── 分销 · 佣金明细 ───────────────────────────────────────────── */
  "Commission Details": { en: "Commission Details", zh: "佣金明细" },
  "Order amount": { en: "Order amount", zh: "订单金额" },
  Level: { en: "Level", zh: "层级" },
  "Level {n}": { en: "Level {n}", zh: "第 {n} 级" },
  Rate: { en: "Rate", zh: "比例" },
  Commission: { en: "Commission", zh: "佣金" },
  "Settled at": { en: "Settled at", zh: "结算时间" },
  "Pending settlement": { en: "Pending settlement", zh: "待结算" },
  Settled: { en: "Settled", zh: "已结算" },
  Reversed: { en: "Reversed", zh: "已冲正" },
  "No commission records yet.": { en: "No commission records yet.", zh: "还没有佣金记录。" },
  "Commissions appear here once an order is paid.": {
    en: "Commissions appear here once an order is paid.",
    zh: "订单支付后，佣金会显示在这里。",
  },

  /* ── 分销 · 提现 ───────────────────────────────────────────────── */
  Withdrawals: { en: "Withdrawals", zh: "提现管理" },
  "Minimum withdrawal": { en: "Minimum withdrawal", zh: "最低提现金额" },
  "Minimum withdrawal: {amount}": {
    en: "Minimum withdrawal: {amount}",
    zh: "最低提现金额：{amount}",
  },
  "Request a withdrawal": { en: "Request a withdrawal", zh: "申请提现" },
  "Payout account": { en: "Payout account", zh: "收款账户" },
  "Alipay account or bank card number": {
    en: "Alipay account or bank card number",
    zh: "支付宝账号或银行卡号",
  },
  Remark: { en: "Remark", zh: "备注" },
  Optional: { en: "Optional", zh: "选填" },
  Submitting: { en: "Submitting", zh: "提交中…" },
  "Enter an amount": { en: "Enter an amount", zh: "请输入提现金额" },
  "Amount must be at least {amount}": {
    en: "Amount must be at least {amount}",
    zh: "提现金额不能低于 {amount}",
  },
  "Amount exceeds your available balance": {
    en: "Amount exceeds your available balance",
    zh: "提现金额超过可提现余额",
  },
  "Withdrawal request submitted": {
    en: "Withdrawal request submitted",
    zh: "提现申请已提交",
  },
  "My withdrawal records": { en: "My withdrawal records", zh: "我的提现记录" },
  "Account (masked)": { en: "Account (masked)", zh: "收款账户（尾号）" },
  "Requested at": { en: "Requested at", zh: "申请时间" },
  "Reviewed at": { en: "Reviewed at", zh: "审核时间" },
  "Paid at": { en: "Paid at", zh: "打款时间" },
  "Review note": { en: "Review note", zh: "审核备注" },
  "No withdrawal records yet.": {
    en: "No withdrawal records yet.",
    zh: "还没有提现记录。",
  },
  "Pending review": { en: "Pending review", zh: "待审核" },
  Approved: { en: "Approved", zh: "已通过" },
  "Paid out": { en: "Paid out", zh: "已打款" },
  Rejected: { en: "Rejected", zh: "已驳回" },

  /* ── 分销 · 团队业绩 ───────────────────────────────────────────── */
  "Team Performance": { en: "Team Performance", zh: "团队业绩" },
  "Last {n} days": { en: "Last {n} days", zh: "最近 {n} 天" },
  "Team orders": { en: "Team orders", zh: "团队订单数" },
  "Team sales": { en: "Team sales", zh: "团队销售额" },
  "Daily breakdown": { en: "Daily breakdown", zh: "每日明细" },
  Date: { en: "Date", zh: "日期" },
  "No performance data for this period.": {
    en: "No performance data for this period.",
    zh: "该时间段内还没有业绩数据。",
  },
  /** 2026-09-24 多币种分销结算 */
  "Settlement currency": { en: "Settlement currency", zh: "结算币种" },
  "Commission and withdrawals are accounted in this currency. It can only be changed before you earn your first commission.":
    {
      en: "Commission and withdrawals are accounted in this currency. It can only be changed before you earn your first commission.",
      zh: "佣金入账与提现均按该币种计价；产生第一笔佣金前可自由变更，之后锁定（保证账本口径一致）。",
    },
  "Settlement amount": { en: "Settlement amount", zh: "结算金额" },
  Saved: { en: "Saved", zh: "已保存" },
  "Save failed": { en: "Save failed", zh: "保存失败" },
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
