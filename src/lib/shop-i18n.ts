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
  "Export a copy of your personal data (profile, orders, reviews and subscriptions) as JSON.": {
    en: "Export a copy of your personal data (profile, orders, reviews and subscriptions) as JSON.",
    zh: "将你的个人数据（资料、订单、评价与订阅）导出为 JSON 文件。",
  },
  "Export my data": { en: "Export my data", zh: "导出我的数据" },

  /* ── Brand & tagline ───────────────────────────────────────────── */
  "Considered design": { en: "Considered design", zh: "用心设计" },
  "Considered goods for everyday living. Thoughtfully designed, responsibly made.": { en: "Considered goods for everyday living. Thoughtfully designed, responsibly made.", zh: "为日常而生的精选好物。精心设计，用心制造。" },
  "Switch language": { en: "Switch language", zh: "切换语言" },

  /* ── Top nav (header) ──────────────────────────────────────────── */
  "Shop": { en: "Shop", zh: "购物" },
  "All Products": { en: "All Products", zh: "全部商品" },
  "New Arrivals": { en: "New Arrivals", zh: "新品上架" },
  "Bestsellers": { en: "Bestsellers", zh: "热销榜单" },
  "Account": { en: "Account", zh: "账户" },
  "Sign In": { en: "Sign In", zh: "登录" },
  "Login": { en: "Login", zh: "登录" },
  "E-mail": { en: "E-mail", zh: "邮箱" },
  "Enter your email and password to login:": { en: "Enter your email and password to login:", zh: "请输入邮箱与密码登录：" },
  "Don't have an account?": { en: "Don't have an account?", zh: "还没有账号？" },
  "FAQs": { en: "FAQs", zh: "常见问题" },
  "Accessibility Statement": { en: "Accessibility Statement", zh: "无障碍声明" },
  "Terms and Conditions": { en: "Terms and Conditions", zh: "条款与条件" },
  "Cookie Consent": { en: "Cookie Consent", zh: "Cookie 同意" },
  "Sold out": { en: "Sold out", zh: "已售罄" },
  "Notify me": { en: "Notify me", zh: "到货通知" },
  "Notify me when back in stock": { en: "Notify me when back in stock", zh: "到货时通知我" },
  "Get a notification as soon as this product is back in stock by signing up below": { en: "Get a notification as soon as this product is back in stock by signing up below", zh: "填写邮箱，到货后第一时间通知您" },
  "Notify me when available": { en: "Notify me when available", zh: "到货通知我" },
  "You'll only receive notifications for this product": { en: "You'll only receive notifications for this product", zh: "仅在该商品到货时发送通知" },
  "Thank you! We will notify you when the product is available": { en: "Thank you! We will notify you when the product is available", zh: "谢谢！到货后我们将通知您" },
  "Please select a variant to be notified about": { en: "Please select a variant to be notified about", zh: "请选择要关注的规格/颜色" },
  "Enter your email": { en: "Enter your email", zh: "请输入邮箱" },
  "Email address": { en: "Email address", zh: "邮箱地址" },
  "We'll email you when this product is back in stock": { en: "We'll email you when this product is back in stock", zh: "到货后我们将邮件通知您" },
  "You're on the list for this product": { en: "You're on the list for this product", zh: "您已登记该商品到货通知" },
  "New": { en: "New", zh: "新品" },
  "Hot": { en: "Hot", zh: "热卖" },
  "Sale": { en: "Sale", zh: "特惠" },
  "Cost": { en: "Cost", zh: "成本价" },
  "Search...": { en: "Search...", zh: "搜索..." },
  "result for": { en: "result for", zh: "个结果：" },
  "results for": { en: "results for", zh: "个结果：" },
  "Pages": { en: "Pages", zh: "页面" },
  "Relevance": { en: "Relevance", zh: "相关度" },
  "Price, low to high": { en: "Price, low to high", zh: "价格从低到高" },
  "Price, high to low": { en: "Price, high to low", zh: "价格从高到低" },
  "Filters": { en: "Filters", zh: "筛选" },
  "In stock only": { en: "In stock only", zh: "仅显示有货" },
  "View results": { en: "View results", zh: "查看结果" },
  "No results found.": { en: "No results found.", zh: "没有找到相关结果。" },
  "Suggestions": { en: "Suggestions", zh: "搜索建议" },
  "Sign Out": { en: "Sign Out", zh: "退出登录" },
  "Create Account": { en: "Create Account", zh: "创建账户" },
  "My Orders": { en: "My Orders", zh: "我的订单" },
  "Policies": { en: "Policies", zh: "政策条款" },
  "Privacy Policy": { en: "Privacy Policy", zh: "隐私政策" },
  "Terms of Service": { en: "Terms of Service", zh: "服务条款" },
  "Refund Policy": { en: "Refund Policy", zh: "退款政策" },
  "Cookie Policy": { en: "Cookie Policy", zh: "Cookie 政策" },

  /* ── User menu ────────────────────────────────────────────────── */
  "My Account": { en: "My Account", zh: "个人中心" },
  "My Favorites": { en: "My Favorites", zh: "我的收藏" },
  "My Coupons": { en: "My Coupons", zh: "我的优惠券" },
  "Profile": { en: "Profile", zh: "个人资料" },
  "Change Password": { en: "Change Password", zh: "修改密码" },
  "Shipping Address": { en: "Shipping Address", zh: "收货地址" },

  /* ── Header cart & search ─────────────────────────────────────── */
  "Cart": { en: "Cart", zh: "购物车" },
  "Shopping Bag": { en: "Shopping Bag", zh: "购物袋" },
  "Search": { en: "Search", zh: "搜索" },
  "Search products": { en: "Search products", zh: "搜索商品" },

  /* ── Home page ────────────────────────────────────────────────── */
  "Featured": { en: "Featured", zh: "综合排序" },
  "New in": { en: "New in", zh: "新品" },
  "Trending now": { en: "Trending now", zh: "热销中" },
  "For your home": { en: "For your home", zh: "为你的家" },
  "Best selling": { en: "Best selling", zh: "销量优先" },
  "Browse products": { en: "Browse products", zh: "去看看商品" },
  "Shop now": { en: "Shop now", zh: "立即选购" },

  /* ── Product listing pages ────────────────────────────────────── */
  "Products": { en: "Products", zh: "商品" },
  "Sort by": { en: "Sort by", zh: "排序方式" },
  "Price: low to high": { en: "Price: low to high", zh: "价格从低到高" },
  "Price: high to low": { en: "Price: high to low", zh: "价格从高到低" },
  "No products found": { en: "No products found", zh: "没有找到商品" },
  "No products found. Try a different filter.": { en: "No products found. Try a different filter.", zh: "没有找到商品，换个筛选条件试试吧。" },
  "Load more": { en: "Load more", zh: "加载更多" },
  "filters": { en: "filters", zh: "筛选" },
  "Clear filters": { en: "Clear filters", zh: "清除筛选" },
  "In stock": { en: "In stock", zh: "有货" },
  "Out of stock": { en: "Out of stock", zh: "缺货" },
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
  "Preorder": { en: "Preorder", zh: "预定" },
  "Active": { en: "Active", zh: "在售" },
  "Offline": { en: "Offline", zh: "下架" },
  "Product Status": { en: "Product Status", zh: "商品状态" },

  /* ── Product detail ───────────────────────────────────────────── */
  "Details": { en: "Details", zh: "详情" },
  "Reviews": { en: "Reviews", zh: "评价" },
  "Related recommendations": { en: "Related recommendations", zh: "相关推荐" },
  "Add to cart": { en: "Add to cart", zh: "加入购物车" },
  "Buy now": { en: "Buy now", zh: "立即购买" },
  "Add to favorites": { en: "Add to favorites", zh: "加入收藏" },
  "Added to favorites": { en: "Added to favorites", zh: "已加入收藏" },
  "Remove from favorites": { en: "Remove from favorites", zh: "取消收藏" },
  "Removed from favorites": { en: "Removed from favorites", zh: "已取消收藏" },
  "Color": { en: "Color", zh: "颜色" },
  "Capacity": { en: "Capacity", zh: "容量" },
  "Size": { en: "Size", zh: "尺寸" },
  "Storage": { en: "Storage", zh: "存储" },
  "Spec": { en: "Spec", zh: "规格" },
  "Type": { en: "Type", zh: "类型" },
  "Version": { en: "Version", zh: "版本" },
  "Variant": { en: "Variant", zh: "规格" },
  "Configuration": { en: "Configuration", zh: "配置" },
  "Graphics": { en: "Graphics", zh: "显卡" },
  "Switch": { en: "Switch", zh: "轴体" },
  "Recommended Area": { en: "Recommended Area", zh: "适用面积" },
  "Rating": { en: "Rating", zh: "评分" },
  "No reviews yet": { en: "No reviews yet", zh: "暂无评价" },
  "No reviews yet — share your experience after purchase!": { en: "No reviews yet — share your experience after purchase!", zh: "暂无评价，购买后发表您的使用心得吧～" },
  "{n} reviews": { en: "{n} reviews", zh: "{n} 条评价" },
  "{n} review": { en: "{n} review", zh: "{n} 条评价" },
  "Verified Purchase": { en: "Verified Purchase", zh: "已购买" },
  "Anonymous": { en: "Anonymous", zh: "匿名用户" },
  "Submit": { en: "Submit", zh: "提交" },
  "Submitting…": { en: "Submitting…", zh: "提交中…" },
  "Write a Review": { en: "Write a Review", zh: "发表评价" },
  "Select a rating": { en: "Select a rating", zh: "请选择评分" },
  "Share your thoughts…": { en: "Share your thoughts…", zh: "说点什么…" },
  "Review submitted": { en: "Review submitted", zh: "评价已提交" },
  "Review submitted — thanks for sharing!": { en: "Review submitted — thanks for sharing!", zh: "评价已提交，感谢您的分享！" },
  "Failed to submit your review, please try again later": { en: "Failed to submit your review, please try again later", zh: "评价提交失败，请稍后重试" },

  /* ── Cookie consent banner ────────────────────────────────────── */
  "We use cookies to improve your browsing experience and analyze traffic. Clicking \\\"Accept all\\\" means you agree to our use of cookies. See our Cookie Policy.": { en: "We use cookies to improve your browsing experience and analyze traffic. Clicking \\\"Accept all\\\" means you agree to our use of cookies. See our Cookie Policy.", zh: "本站使用 Cookie 以提升浏览体验并统计访问数据。点击「接受全部」即表示同意我们使用 Cookie。详见 Cookie 政策。" },
  "Accept all": { en: "Accept all", zh: "接受全部" },
  "Accept necessary only": { en: "Accept necessary only", zh: "仅接受必要" },
  "Necessary only": { en: "Necessary only", zh: "仅必要" },
  "Cookie consent cleared — you'll be asked again on the next visit": { en: "Cookie consent cleared — you'll be asked again on the next visit", zh: "已清除 Cookie 同意记录，下次访问时将重新询问" },
  "Reset cookie consent": { en: "Reset cookie consent", zh: "重置 Cookie 同意" },

  /* ── Cart ─────────────────────────────────────────────────────── */
  "Your cart is empty": { en: "Your cart is empty", zh: "购物车是空的" },
  "Your cart is empty — start adding products.": { en: "Your cart is empty — start adding products.", zh: "购物车是空的，快去挑选心仪的商品吧。" },
  "Subtotal": { en: "Subtotal", zh: "小计" },
  "Total": { en: "Total", zh: "合计" },
  "Shipping": { en: "Shipping", zh: "运费" },
  "Estimate": { en: "Estimate", zh: "估算" },
  "Checkout": { en: "Checkout", zh: "结算" },
  "Remove": { en: "Remove", zh: "删除" },
  "remove": { en: "remove", zh: "删除" },
  "Qty": { en: "Qty", zh: "数量" },
  "Quantity": { en: "Quantity", zh: "数量" },
  "Continue shopping": { en: "Continue shopping", zh: "继续购物" },
  "Product": { en: "Product", zh: "商品" },
  "Total:": { en: "Total:", zh: "合计：" },
  "USD": { en: "USD", zh: "USD" },
  "Taxes and shipping calculated at checkout": { en: "Taxes and shipping calculated at checkout", zh: "税费与运费将在结算时计算" },
  Pagination: { en: "Pagination", zh: "分页" },
  "Contact us": { en: "Contact us", zh: "联系我们" },
  "Share product card": { en: "Share product card", zh: "分享商品卡" },
  "Copy link": { en: "Copy link", zh: "复制链接" },
  "Share": { en: "Share", zh: "分享" },
  "Share to": { en: "Share to", zh: "分享到" },
  "WeChat": { en: "WeChat", zh: "微信" },
  "Scan with WeChat": { en: "Scan with WeChat", zh: "微信扫一扫" },
  "Close": { en: "Close", zh: "关闭" },
  "Could not generate QR code": { en: "Could not generate QR code", zh: "二维码生成失败" },
  "Copy failed, please copy the link manually": { en: "Copy failed, please copy the link manually", zh: "复制失败，请手动复制链接" },
      "About": { en: "About", zh: "关于商品" },
    "Product card saved — link copied": { en: "Product card saved — link copied", zh: "商品卡已保存，链接已复制" },
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
  "Items": { en: "Items", zh: "商品" },
  "Summary": { en: "Summary", zh: "结算栏" },
  "Enter coupon code": { en: "Enter coupon code", zh: "输入优惠码" },
  "Apply": { en: "Apply", zh: "应用" },
  "Coupon code applied": { en: "Coupon code applied", zh: "优惠码已应用" },
  "Invalid coupon code": { en: "Invalid coupon code", zh: "优惠码无效" },
  "Enter a coupon code first": { en: "Enter a coupon code first", zh: "请先输入优惠码" },

  /* ── Checkout flow ────────────────────────────────────────────── */
  "Select shipping address": { en: "Select shipping address", zh: "选择收货地址" },
  "Please select a shipping address first": { en: "Please select a shipping address first", zh: "请先选择收货地址" },
  "Add a shipping address": { en: "Add a shipping address", zh: "新增收货地址" },
  "Contact": { en: "Contact", zh: "联系方式" },
  "Recipient": { en: "Recipient", zh: "收件人" },
  "Phone": { en: "Phone", zh: "手机号" },
  "Address": { en: "Address", zh: "详细地址" },
  "City": { en: "City", zh: "城市" },
  "State / Province / Region": { en: "State / Province / Region", zh: "省/市/自治区" },
  "ZIP / Postal": { en: "ZIP / Postal", zh: "邮政编码" },
  "Email": { en: "Email", zh: "邮箱" },
  "Name": { en: "Name", zh: "姓名" },
  "Order number": { en: "Order number", zh: "订单号" },
  "Optional — helps us find your order faster": { en: "Optional — helps us find your order faster", zh: "选填——便于我们更快定位您的订单" },
  "Subject": { en: "Subject", zh: "主题" },
  "Message": { en: "Message", zh: "留言内容" },
  "Please fill in all required fields": { en: "Please fill in all required fields", zh: "请填写所有必填项" },
  "Send failed, please retry": { en: "Send failed, please retry", zh: "发送失败，请重试" },
  "Your message has been sent.": { en: "Your message has been sent.", zh: "您的留言已提交。" },
  "Our team will reply within one business day.": { en: "Our team will reply within one business day.", zh: "客服团队将在一个工作日内回复您。" },
  "Sending…": { en: "Sending…", zh: "发送中…" },
  "Send message": { en: "Send message", zh: "发送留言" },
  "Place order": { en: "Place order", zh: "提交订单" },
  "Pay now": { en: "Pay now", zh: "前往支付" },
  "Your order has no items": { en: "Your order has no items", zh: "订单中没有商品" },
  "Failed to load checkout data": { en: "Failed to load checkout data", zh: "加载结算数据失败" },
  "Please fill in accurate contact and shipping details.": { en: "Please fill in accurate contact and shipping details.", zh: "请填写准确的联系方式与收货地址。" },
  "Order submitted": { en: "Order submitted", zh: "订单已提交" },
  "Failed to submit your order, please try again later": { en: "Failed to submit your order, please try again later", zh: "订单提交失败，请稍后重试" },
  "The best available offer has been applied at checkout": { en: "The best available offer has been applied at checkout", zh: "结算时已自动应用最佳优惠" },
  "Processing…": { en: "Processing…", zh: "处理中…" },
  "Processing": { en: "Processing", zh: "处理中" },

  /* ── Mock payment & result pages ──────────────────────────────── */
  "Mock payment": { en: "Mock payment", zh: "模拟支付环境" },
  "Mock payment successful": { en: "Mock payment successful", zh: "模拟支付成功" },
  "No real payment channel (Stripe) is configured — this is a demo mock payment flow. Clicking \\\"Mock payment successful\\\" will mark the order as paid immediately.": { en: "No real payment channel (Stripe) is configured — this is a demo mock payment flow. Clicking \\\"Mock payment successful\\\" will mark the order as paid immediately.", zh: "当前未配置真实支付渠道(Stripe)，以下为演示用模拟支付流程。点击「模拟支付成功」将直接标记订单为已支付。" },
  "Payment cancelled": { en: "Payment cancelled", zh: "支付已取消" },
  "Payment received": { en: "Payment received", zh: "支付成功" },
  "Payment failed, please try again later": { en: "Payment failed, please try again later", zh: "支付失败，请稍后重试" },
  "Payment result": { en: "Payment result", zh: "支付结果" },
  "Your order has been paid — we'll ship it as soon as possible.": { en: "Your order has been paid — we'll ship it as soon as possible.", zh: "您的订单已支付成功，我们将尽快为您安排发货。" },
  "Your order hasn't been paid yet — you can complete payment later from My Orders.": { en: "Your order hasn't been paid yet — you can complete payment later from My Orders.", zh: "您的订单尚未支付，可稍后在我的订单中继续支付。" },
  "Redirecting…": { en: "Redirecting…", zh: "跳转中…" },
  "View order": { en: "View order", zh: "查看订单" },
  "Back to order": { en: "Back to order", zh: "返回订单" },
  "Back to home": { en: "Back to home", zh: "返回首页" },

  /* ── Auth: sign in ─────────────────────────────────────────────── */
  "Sign in to your Ox Shopping account": { en: "Sign in to your Ox Shopping account", zh: "登录 Ox Shopping 账号" },
  "Welcome back to Ox Shopping — please sign in.": { en: "Welcome back to Ox Shopping — please sign in.", zh: "欢迎回到 Ox Shopping，请登录您的账号。" },
  "Password": { en: "Password", zh: "密码" },
  "Please enter your password": { en: "Please enter your password", zh: "请输入密码" },
  "Remember me": { en: "Remember me", zh: "记住我" },
  "Remember me (stored locally for 30 days)": { en: "Remember me (stored locally for 30 days)", zh: "记住我(本地存储 30 天)" },
  "Forgot password?": { en: "Forgot password?", zh: "忘记密码？" },
  "No account?": { en: "No account?", zh: "没有账号？" },
  "Sign-in failed, please try again later": { en: "Sign-in failed, please try again later", zh: "登录失败，请稍后重试" },
  "Already have an account?": { en: "Already have an account?", zh: "已有账号？" },

  /* ── Auth: register ───────────────────────────────────────────── */
  "Register": { en: "Register", zh: "注册" },
  "Register a Ox Shopping account and start shopping": { en: "Register a Ox Shopping account and start shopping", zh: "注册 Ox Shopping 账号，开启购物之旅" },
  "Password strength": { en: "Password strength", zh: "密码强度" },
  "Weak": { en: "Weak", zh: "弱" },
  "Fair": { en: "Fair", zh: "中" },
  "Strong": { en: "Strong", zh: "强" },
  "Password must be at least 8 characters": { en: "Password must be at least 8 characters", zh: "密码至少 8 位" },
  "Password must contain an uppercase letter": { en: "Password must contain an uppercase letter", zh: "密码必须包含大写字母" },
  "Password must contain a lowercase letter": { en: "Password must contain a lowercase letter", zh: "密码必须包含小写字母" },
  "Password must contain a digit": { en: "Password must contain a digit", zh: "密码必须包含数字" },
  "Password can be at most 72 characters": { en: "Password can be at most 72 characters", zh: "密码最长 72 位" },
  "Passwords do not match": { en: "Passwords do not match", zh: "两次输入的密码不一致" },
  "Registration successful — please sign in": { en: "Registration successful — please sign in", zh: "注册成功，请登录" },
  "Registration failed, please try again later": { en: "Registration failed, please try again later", zh: "注册失败，请稍后重试" },

  /* ── Auth: forgot/reset/verify ────────────────────────────────── */
  "Forgot Password": { en: "Forgot Password", zh: "找回密码" },
  "Enter your registered email — we will send you a reset link.": { en: "Enter your registered email — we will send you a reset link.", zh: "输入注册邮箱，我们将发送重置密码链接。" },
  "If that email is registered, a reset email is on its way. If no email service is configured, check the server logs.": { en: "If that email is registered, a reset email is on its way. If no email service is configured, check the server logs.", zh: "若该邮箱已注册，重置邮件已发送，请查收(未配置邮件服务时请查看服务端日志)。" },
  "Reset Password": { en: "Reset Password", zh: "重置密码" },
  "Set a new password": { en: "Set a new password", zh: "设置新密码" },
  "New Password": { en: "New Password", zh: "新密码" },
  "Confirm new password": { en: "Confirm new password", zh: "确认新密码" },
  "Please re-enter the new password": { en: "Please re-enter the new password", zh: "请再次输入新密码" },
  "New passwords do not match": { en: "New passwords do not match", zh: "两次输入的新密码不一致" },
  "Password updated": { en: "Password updated", zh: "密码已更新" },
  "Password reset — please sign in with your new password": { en: "Password reset — please sign in with your new password", zh: "密码重置成功，请使用新密码登录" },
  "Reset link is invalid or has expired": { en: "Reset link is invalid or has expired", zh: "重置链接无效或已过期" },
  "Email Verification": { en: "Email Verification", zh: "邮箱验证" },
  "Verify your registered email": { en: "Verify your registered email", zh: "验证您的注册邮箱" },
  "Verifying your email…": { en: "Verifying your email…", zh: "正在验证您的邮箱…" },
  "Email verified": { en: "Email verified", zh: "邮箱验证成功" },
  "Your email has been verified — you can now access all features.": { en: "Your email has been verified — you can now access all features.", zh: "您的邮箱已通过验证，现在可以正常使用全部功能。" },
  "Email verification failed": { en: "Email verification failed", zh: "邮箱验证失败" },
  "Missing verification token — please open this page through the link in the email.": { en: "Missing verification token — please open this page through the link in the email.", zh: "缺少验证令牌，请从邮件中的链接进入本页。" },
  "Verification failed, please try again later": { en: "Verification failed, please try again later", zh: "验证失败，请稍后重试" },

  /* ── Account: profile ─────────────────────────────────────────── */
  "Profile updated": { en: "Profile updated", zh: "资料已更新" },
  "Failed to save, please try again later": { en: "Failed to save, please try again later", zh: "保存失败，请稍后重试" },
  "Name can be at most 30 characters": { en: "Name can be at most 30 characters", zh: "昵称最长 30 个字符" },
  "Name must be at least 2 characters": { en: "Name must be at least 2 characters", zh: "昵称至少 2 个字符" },
  "Save": { en: "Save", zh: "保存" },
  "Failed to load profile info": { en: "Failed to load profile info", zh: "加载个人信息失败" },
  "Delete Account": { en: "Delete Account", zh: "删除账号" },
  "Account deletion is irreversible — proceed with caution.": { en: "Account deletion is irreversible — proceed with caution.", zh: "删除账号后无法恢复，请谨慎操作。" },
  "We will review your request and delete your account and related data after verifying your identity (excluding data we are legally required to keep). This action is irreversible — please proceed carefully.": { en: "We will review your request and delete your account and related data after verifying your identity (excluding data we are legally required to keep). This action is irreversible — please proceed carefully.", zh: "我们将审核您的请求，核实身份后删除您的账户和相关数据(法律法规要求保留的除外)。此操作不可逆,请谨慎操作。" },
  "Submit request": { en: "Submit request", zh: "提交申请" },
  "Your deletion request has been received; we'll process it after verification": { en: "Your deletion request has been received; we'll process it after verification", zh: "已收到您的删除请求，我们将在核实后处理" },
  "Failed to submit request, please try again later": { en: "Failed to submit request, please try again later", zh: "申请提交失败，请稍后重试" },
  "Back to sign in": { en: "Back to sign in", zh: "返回登录" },
  "Invalid email format": { en: "Invalid email format", zh: "邮箱格式不正确" },

  /* ── Account: addresses ────────────────────────────────────────── */
  "Add Address": { en: "Add Address", zh: "新增地址" },
  "Edit": { en: "Edit", zh: "编辑" },
  "Edit shipping address": { en: "Edit shipping address", zh: "编辑收货地址" },
  "Default": { en: "Default", zh: "默认" },
  "Set as default": { en: "Set as default", zh: "设为默认" },
  "Set as default address": { en: "Set as default address", zh: "设为默认收货地址" },
  "Default address set": { en: "Default address set", zh: "已设为默认地址" },
  "Address added": { en: "Address added", zh: "地址已添加" },
  "Address updated": { en: "Address updated", zh: "地址已更新" },
  "Address deleted": { en: "Address deleted", zh: "地址已删除" },
  "No shipping addresses": { en: "No shipping addresses", zh: "暂无收货地址" },
  "No shipping addresses yet. Click \\\"Add Address\\\" to add one.": { en: "No shipping addresses yet. Click \\\"Add Address\\\" to add one.", zh: "没有收货地址，点击「新增地址」添加。" },
  "Enter recipient name": { en: "Enter recipient name", zh: "请输入收件人姓名" },
  "Enter phone number": { en: "Enter phone number", zh: "请输入手机号" },
  "Enter street address": { en: "Enter street address", zh: "请输入详细地址" },
  "Enter city": { en: "Enter city", zh: "请输入城市" },
  "Enter state / province / region": { en: "Enter state / province / region", zh: "请输入省/市/自治区" },
  "Enter ZIP / postal code": { en: "Enter ZIP / postal code", zh: "请输入邮政编码" },
  "Delete the address for {recipientName}?": { en: "Delete the address for {recipientName}?", zh: "确定删除 {recipientName} 的收货地址吗?" },
  "This cannot be undone.": { en: "This cannot be undone.", zh: "删除后无法恢复。" },
  "Cancel": { en: "Cancel", zh: "取消" },
  "Failed to delete, please try again later": { en: "Failed to delete, please try again later", zh: "删除失败，请稍后重试" },
  "Failed to set default, please try again later": { en: "Failed to set default, please try again later", zh: "设置失败，请稍后重试" },
  "Failed to load addresses": { en: "Failed to load addresses", zh: "加载地址失败" },

  /* ── Account: orders list ─────────────────────────────────────── */
  "View and manage all your orders": { en: "View and manage all your orders", zh: "查看与管理您的全部订单" },
  "All": { en: "All", zh: "全部" },
  "Pending": { en: "Pending", zh: "待支付" },
  "Payment pending": { en: "Payment pending", zh: "待支付" },
  "Paid": { en: "Paid", zh: "已支付" },
  "Shipped": { en: "Shipped", zh: "已发货" },
  "Completed": { en: "Completed", zh: "已完成" },
  "Cancelled": { en: "Cancelled", zh: "已取消" },
  "Refunded": { en: "Refunded", zh: "已退款" },
  "No orders in this status — try another status filter.": { en: "No orders in this status — try another status filter.", zh: "当前分类下没有订单，去看看其他状态吧。" },
  "No orders yet — go pick something you like!": { en: "No orders yet — go pick something you like!", zh: "您还没有下单记录，快去选购心仪的商品吧。" },
  "Order #{orderNumber}": { en: "Order #{orderNumber}", zh: "订单号：{orderNumber}" },
  "Order {orderNumber}": { en: "Order {orderNumber}", zh: "订单 {orderNumber}" },
  "Cancel order": { en: "Cancel order", zh: "取消订单" },
  "Confirm receipt": { en: "Confirm receipt", zh: "确认收货" },
  "Receipt confirmed — thanks for your purchase!": { en: "Receipt confirmed — thanks for your purchase!", zh: "已确认收货，感谢您的购买！" },
  "Failed to cancel, please try again later": { en: "Failed to cancel, please try again later", zh: "取消失败，请稍后重试" },
  "Action failed, please try again later": { en: "Action failed, please try again later", zh: "操作失败，请稍后重试" },

  /* ── Order detail ──────────────────────────────────────────────── */
  "Order detail": { en: "Order detail", zh: "订单详情" },
  "Order progress": { en: "Order progress", zh: "订单进度" },
  "Order placed": { en: "Order placed", zh: "订单创建" },
  "Order cancelled": { en: "Order cancelled", zh: "订单取消" },
  "Request a refund": { en: "Request a refund", zh: "申请退款" },
  "Reason": { en: "Reason", zh: "退款原因" },
  "Refund amount": { en: "Refund amount", zh: "退款金额" },
  "Briefly describe why you're requesting a refund": { en: "Briefly describe why you're requesting a refund", zh: "请简要说明退款原因" },
  "Enter refund amount": { en: "Enter refund amount", zh: "请输入退款金额" },
  "Maximum refundable amount (order total)": { en: "Maximum refundable amount (order total)", zh: "可申请退款的最大金额(订单实付)" },
  "Max refund: {max}": { en: "Max refund: {max}", zh: "最多可退 {max}" },
  "Whether the current status allows a refund request": { en: "Whether the current status allows a refund request", zh: "当前状态是否允许申请退款" },
  "Refund request submitted; we'll review it as soon as possible": { en: "Refund request submitted; we'll review it as soon as possible", zh: "退款申请已提交，我们将尽快审核处理" },
  "Delivery info": { en: "Delivery info", zh: "收货信息" },
  "Amount summary": { en: "Amount summary", zh: "金额明细" },
  "Logistics": { en: "Logistics", zh: "物流" },
  "View details": { en: "View details", zh: "查看详情" },

  /* ── Favorites ────────────────────────────────────────────────── */
  "Browse products you've favorited": { en: "Browse products you've favorited", zh: "查看您收藏的商品" },
  "No favorites yet": { en: "No favorites yet", zh: "还没有收藏任何商品" },
  "Click the heart icon on a product detail page to favorite it.": { en: "Click the heart icon on a product detail page to favorite it.", zh: "在商品详情页点击心形按钮即可收藏。" },

  /* ── Coupons ──────────────────────────────────────────────────── */
  "Available Coupons": { en: "Available Coupons", zh: "可用优惠券" },
  "Available Coupons · Enter the code at checkout": { en: "Available Coupons · Enter the code at checkout", zh: "可用优惠券 · 结算时输入优惠码即可使用" },
  "Used Coupons": { en: "Used Coupons", zh: "已使用的优惠券" },
  "You have not used any coupons yet": { en: "You have not used any coupons yet", zh: "还没有使用过优惠券" },
  "No coupons available right now": { en: "No coupons available right now", zh: "暂无可领取的优惠券" },
  "Copy": { en: "Copy", zh: "复制" },
  "Copied": { en: "Copied", zh: "已复制" },
  "Coupon code {code} copied": { en: "Coupon code {code} copied", zh: "优惠码 {code} 已复制" },
  "Copy failed — please copy the coupon code manually": { en: "Copy failed — please copy the coupon code manually", zh: "复制失败，请手动复制优惠码" },
  "Coupon will be redeemed by the system at checkout — shipping is finalized on the checkout page.": { en: "Coupon will be redeemed by the system at checkout — shipping is finalized on the checkout page.", zh: "优惠券将在结算时由系统核销，运费以结算页为准。" },
  "Check the homepage coupon center — we release new coupons from time to time.": { en: "Check the homepage coupon center — we release new coupons from time to time.", zh: "留意首页领券中心，我们会不定期放出优惠券。" },
  "Spend {minSpend}, get {discount}% off": { en: "Spend {minSpend}, get {discount}% off", zh: "满 {minSpend} 元享 {discount} 折" },
  "Spend {minSpend} for free shipping": { en: "Spend {minSpend} for free shipping", zh: "满 {minSpend} 元免运费" },
  "Spend {minSpend}, get {value} off": { en: "Spend {minSpend}, get {value} off", zh: "满 {minSpend} 元减 {value} 元" },
  "{value} off": { en: "{value} off", zh: "立减 {value} 元" },
  "Free shipping sitewide": { en: "Free shipping sitewide", zh: "全场免运费" },
  "(free shipping)": { en: "(free shipping)", zh: "(免运费)" },

  /* ── 404 ──────────────────────────────────────────────────────── */
  "Page not found": { en: "Page not found", zh: "页面不存在" },
  "The page you are looking for may have been removed or the URL is incorrect.": { en: "The page you are looking for may have been removed or the URL is incorrect.", zh: "您访问的页面可能已被删除或地址有误。" },

  /* ── Policy page UI ───────────────────────────────────────────── */
  "Last updated": { en: "Last updated", zh: "最近更新" },
  "As last published": { en: "As last published", zh: "以最新公布为准" },

  /* ── Common buttons / misc ─────────────────────────────────────── */
  "Unknown": { en: "Unknown", zh: "未知" },
  "Free shipping": { en: "Free shipping", zh: "免运费" },

  /* ── Sign-out toast ────────────────────────────────────────────── */
  "Signed out successfully": { en: "Signed out successfully", zh: "已退出登录" },
  "Sign-out failed, please try again later": { en: "Sign-out failed, please try again later", zh: "退出登录失败，请稍后重试" },

  /* ── Product gallery ───────────────────────────────────────────── */
  "View image {n}": { en: "View image {n}", zh: "查看第 {n} 张图片" },
  "Zoom in on image": { en: "Zoom in on image", zh: "放大查看图片" },
  "Close zoom preview": { en: "Close zoom preview", zh: "关闭放大预览" },

  /* ── Rating stars ─────────────────────────────────────────────── */
  "Rating {n} / 5": { en: "Rating {n} / 5", zh: "评分 {n} / 5" },
  "{i} stars": { en: "{i} stars", zh: "{i} 星" },

  /* ── Review form ──────────────────────────────────────────────── */
  "Submit review": { en: "Submit review", zh: "发表评价" },
  "Title (optional)": { en: "Title (optional)", zh: "标题（选填）" },
  "Review content": { en: "Review content", zh: "评价内容" },
  "Summarize your experience in one line": { en: "Summarize your experience in one line", zh: "用一句话概括你的使用体验" },
  "Share your experience — pros, cons, etc. (at least 5 chars)": { en: "Share your experience — pros, cons, etc. (at least 5 chars)", zh: "说点什么…（至少 5 个字符）" },

  /* ── Coupon card ──────────────────────────────────────────────── */
  "{discount}% off": { en: "{discount}% off", zh: "{discount} 折" },
  "Valid: {start} to {end}": { en: "Valid: {start} to {end}", zh: "有效期：{start} 至 {end}" },

  /* ── Cart page ────────────────────────────────────────────────── */
  "Please enter a promo code": { en: "Please enter a promo code", zh: "请输入优惠券码" },
  "Promo code applied": { en: "Promo code applied", zh: "优惠券已应用" },
  "Could not apply promo code": { en: "Could not apply promo code", zh: "优惠券应用失败" },
  "Item removed": { en: "Item removed", zh: "已移除商品" },
  "Could not remove, please try again": { en: "Could not remove, please try again", zh: "移除失败，请稍后重试" },
  "Your bag is empty": { en: "Your bag is empty", zh: "购物袋是空的" },
  "Discover something you will love — quality goods for everyday living.": { en: "Discover something you will love — quality goods for everyday living.", zh: "发现你心仪的好物——精心设计的好品质日常用品。" },
  "Browse Products": { en: "Browse Products", zh: "去逛逛商品" },
  "{count} items": { en: "{count} items", zh: "{count} 件商品" },
  "remove this item": { en: "remove this item", zh: "移除该商品" },
  "DiscountCoupon": { en: "DiscountCoupon", zh: "优惠券" },
  "Applying…": { en: "Applying…", zh: "应用中…" },
  "Coupon will be redeemed by the system at checkout; shipping is finalized on the checkout page.": { en: "Coupon will be redeemed by the system at checkout; shipping is finalized on the checkout page.", zh: "优惠券将在结算时由系统核销，运费以结算页为准。" },
  "Discount": { en: "Discount", zh: "折扣" },
  "Calculated at checkout": { en: "Calculated at checkout", zh: "结算时计算" },
  "Estimated total": { en: "Estimated total", zh: "预估合计" },
  "Continue Shopping": { en: "Continue Shopping", zh: "继续购物" },

  /* ── Checkout flow ─────────────────────────────────────────────── */
  "1. Shipping Address": { en: "1. Shipping Address", zh: "1. 收货地址" },
  "2. Shipping method": { en: "2. Shipping method", zh: "2. 配送方式" },
  "3. Coupon (optional)": { en: "3. Coupon (optional)", zh: "3. 优惠券（可选）" },
  "4. Order notes (optional)": { en: "4. Order notes (optional)", zh: "4. 订单备注（可选）" },
  "5. Order summary": { en: "5. Order summary", zh: "5. 订单摘要" },
  "Checkout unavailable": { en: "Checkout unavailable", zh: "暂时无法结算" },
  "Your cart is empty or items failed to load — please go back and continue shopping.": { en: "Your cart is empty or items failed to load — please go back and continue shopping.", zh: "购物车为空，或商品信息加载失败，请返回继续选购。" },
  "No shipping address yet — please add one first.": { en: "No shipping address yet — please add one first.", zh: "没有收货地址，点击右键新增。" },
  "Standard shipping (3-5 days)": { en: "Standard shipping (3-5 days)", zh: "标准配送（3-5 天）" },
  "Express shipping (1-2 days)": { en: "Express shipping (1-2 days)", zh: "加急配送（1-2 天）" },
  "Spend {threshold} for free shipping (or use a free-shipping coupon)": { en: "Spend {threshold} for free shipping (or use a free-shipping coupon)", zh: "满 {threshold} 免运费（或使用免运券）" },
  "Applied coupon": { en: "Applied coupon", zh: "已应用优惠券" },
  "Enter coupon code, e.g. WELCOME10": { en: "Enter coupon code, e.g. WELCOME10", zh: "输入优惠券码，例如 WELCOME10" },
  "Delivery time requests, invoice details, etc. (max 300 chars)": { en: "Delivery time requests, invoice details, etc. (max 300 chars)", zh: "配送时间要求、发票信息等（最多 300 字）" },
  "Place order · {total}": { en: "Place order · {total}", zh: "提交订单 · {total}" },
  "Failed to refresh the address list": { en: "Failed to refresh the address list", zh: "刷新地址列表失败" },
  "Please select a shipping address": { en: "Please select a shipping address", zh: "请先选择收货地址" },
  "Cancelling…": { en: "Cancelling…", zh: "取消中…" },
  "No real payment channel (Stripe) is configured — this is a demo mock payment flow. Clicking [Mock payment successful] will mark the order as paid.": { en: "No real payment channel (Stripe) is configured — this is a demo mock payment flow. Clicking [Mock payment successful] will mark the order as paid.", zh: "当前未配置真实支付渠道（Stripe），以下为演示用模拟支付流程。点击「模拟支付成功」将直接标记订单为已支付。" },
  "Order pending payment": { en: "Order pending payment", zh: "待支付订单号" },
  "Your order has been paid — we will ship it as soon as possible.": { en: "Your order has been paid — we will ship it as soon as possible.", zh: "您的订单已支付成功，我们将尽快为您安排发货。" },
  "Your order has not been paid yet — complete payment later from My Orders.": { en: "Your order has not been paid yet — complete payment later from My Orders.", zh: "您的订单尚未支付，可稍后在我的订单中继续支付。" },
  "Order #": { en: "Order #", zh: "订单号：" },

  /* ── Auth: extras (login-form / register / forgot / reset / verify — keys not already above) */
  "Sign Up": { en: "Sign Up", zh: "注册" },
  "Sign up": { en: "Sign up", zh: "注册" },
  "Signing up…": { en: "Signing up…", zh: "注册中…" },
  "Create a Ox Shopping account and start shopping.": { en: "Create a Ox Shopping account and start shopping.", zh: "注册 Ox Shopping 账号，开启购物之旅。" },
  "Registration successful!": { en: "Registration successful!", zh: "注册成功！" },
  "2-30 characters": { en: "2-30 characters", zh: "2-30 个字符" },
  "At least 8 chars with upper/lowercase and a digit": { en: "At least 8 chars with upper/lowercase and a digit", zh: "至少 8 位，含大小写字母与数字" },
  "Notice: after registering, you may need to verify your email (if no email service is configured, this is logged server-side and does not affect sign-in).": { en: "Notice: after registering, you may need to verify your email (if no email service is configured, this is logged server-side and does not affect sign-in).", zh: "注册后可能需要验证邮箱（未配置邮件服务时仅记录日志，不影响登录）。" },
  "Welcome back, {name}!": { en: "Welcome back, {name}!", zh: "欢迎回来，{name}！" },
  "Test accounts：user@example.com / User@123456 (admin admin@example.com / Admin@123456)": { en: "Test accounts：user@example.com / User@123456 (admin admin@example.com / Admin@123456)", zh: "测试账号：user@example.com / User@123456 (管理员 admin@example.com / Admin@123456)" },
  "Request failed, please try again later": { en: "Request failed, please try again later", zh: "请求失败，请稍后重试" },
  "Send reset email": { en: "Send reset email", zh: "发送重置邮件" },
  "Remember it now?": { en: "Remember it now?", zh: "想起来了？" },
  "Reset failed, please try again later": { en: "Reset failed, please try again later", zh: "重置失败，请稍后重试" },
  "Please enter a new password (8-72 chars with upper/lowercase and a digit).": { en: "Please enter a new password (8-72 chars with upper/lowercase and a digit).", zh: "请输入新密码（8-72 位，含大小写字母与数字）。" },
  "Please enter a new password": { en: "Please enter a new password", zh: "请输入新密码" },
  "Confirm reset": { en: "Confirm reset", zh: "确认重置" },
  "Email verified!": { en: "Email verified!", zh: "邮箱验证成功！" },
  "Verification link invalid or expired — please resend the verification email.": { en: "Verification link invalid or expired — please resend the verification email.", zh: "验证链接无效或已过期，请重新发送验证邮件。" },
  "Help": { en: "Help", zh: "帮助" },

  /* ── Home page ────────────────────────────────────────────────── */
  "New Season / 2026": { en: "New Season / 2026", zh: "新年季 / 2026" },
  "Considered goods for": { en: "Considered goods for", zh: "为" },
  "everyday living.": { en: "everyday living.", zh: "日常生活而精选的好物。" },
  "Thoughtfully designed products, responsibly made, built to last.": { en: "Thoughtfully designed products, responsibly made, built to last.", zh: "精心设计的产品，负责地制造，经久耐用。" },
  "Shop All": { en: "Shop All", zh: "全部选购" },
  "Free Shipping": { en: "Free Shipping", zh: "全场包邮" },
  "On all orders over $75": { en: "On all orders over $75", zh: "$75 以上订单" },
  "30-Day Returns": { en: "30-Day Returns", zh: "30 天退换" },
  "No questions asked": { en: "No questions asked", zh: "无理由退换" },
  "Responsibly Made": { en: "Responsibly Made", zh: "责任制造" },
  "Built to last": { en: "Built to last", zh: "经久耐用" },
  "Curated": { en: "Curated", zh: "精选系列" },
  "Collections": { en: "Collections", zh: "主题精选" },
  "Explore": { en: "Explore", zh: "去看看" },
  "Everything in store": { en: "Everything in store", zh: "全部好物" },

  /* ── Orders detail / list ──────────────────────────────────────── */
  "Order actions": { en: "Order actions", zh: "订单操作" },
  "Order total": { en: "Order total", zh: "订单总额" },
  "Amount details": { en: "Amount details", zh: "金额明细" },
  "Please pay as soon as possible — unpaid orders are auto-cancelled when they time out.": { en: "Please pay as soon as possible — unpaid orders are auto-cancelled when they time out.", zh: "请尽快完成支付，超时未支付订单将自动取消。" },
  "Download invoice": { en: "Download invoice", zh: "下载发票" },
  "Items list": { en: "Items list", zh: "商品清单" },
  "Shipping address": { en: "Shipping address", zh: "收货地址" },
  "Shipping company: ": { en: "Shipping company: ", zh: "物流公司：" },
  "Tracking No.:": { en: "Tracking No.:", zh: "运单号：" },
  "We will ship as soon as the order is paid": { en: "We will ship as soon as the order is paid", zh: "订单支付后我们将尽快发货" },
  "No tracking info yet — please wait": { en: "No tracking info yet — please wait", zh: "暂无物流信息，请耐心等待" },
  "No orders yet — try another status filter.": { en: "No orders yet — try another status filter.", zh: "当前状态下没有订单，去试试其他状态吧。" },

  /* ── Misc. ────────────────────────────────────────────────────── */
  "Last updated:": { en: "Last updated:", zh: "最近更新：" },
  "Cookie consent cleared — you will be asked again on the next visit": { en: "Cookie consent cleared — you will be asked again on the next visit", zh: "已清除 Cookie 同意记录，下次访问时将重新询问" },
  "Failed to clear — please check your browser privacy settings": { en: "Failed to clear — please check your browser privacy settings", zh: "清除失败，请检查浏览器隐私设置" },
  "Tax": { en: "Tax", zh: "税费" },
  "Redirecting...": { en: "Redirecting...", zh: "正在跳转…" },
  "Processing...": { en: "Processing...", zh: "处理中…" },
  "Yes": { en: "Yes", zh: "是" },
  "No": { en: "No", zh: "否" },

  /* ── keys added 2026-08-21 (account/auth/orders extra) ─────────── */
  "11-digit phone": { en: "11-digit phone", zh: "11 位电话号码" },
  "Account deletion request": { en: "Account deletion request", zh: "账号删除申请" },
  "Account navigation": { en: "Account navigation", zh: "账号中心导航" },
  "Add an address for fast checkout.": { en: "Add an address for fast checkout.", zh: "添加地址，结算更快捷。" },
  "Briefly explain why you want to delete your account (optional)": { en: "Briefly explain why you want to delete your account (optional)", zh: "简要说明你想删除账号的原因（可选）" },
  "Confirm changes": { en: "Confirm changes", zh: "确认修改" },
  "Confirm delete": { en: "Confirm delete", zh: "确认删除" },
  "Current Password": { en: "Current Password", zh: "当前密码" },
  "Current status:": { en: "Current status:", zh: "当前状态：" },
  "Delete address": { en: "Delete address", zh: "删除地址" },
  "Delete this shipping address?": { en: "Delete this shipping address?", zh: "删除这个收货地址？" },
  "District / County": { en: "District / County", zh: "区/县" },
  "Edit address": { en: "Edit address", zh: "编辑地址" },
  "Email (read-only)": { en: "Email (read-only)", zh: "邮箱（只读）" },
  "Enter the coupon code at checkout to apply": { en: "Enter the coupon code at checkout to apply", zh: "结算时输入优惠券码即可使用" },
  "Enter your name": { en: "Enter your name", zh: "输入你的姓名" },
  "Failed to change, please try again later": { en: "Failed to change, please try again later", zh: "修改失败，请稍后重试" },
  "Failed to submit, please try again later": { en: "Failed to submit, please try again later", zh: "提交失败，请稍后重试" },
  "Good": { en: "Good", zh: "好" },
  "No shipping address yet": { en: "No shipping address yet", zh: "暂无收货地址" },
  "Order notes: ": { en: "Order notes: ", zh: "订单备注：" },
  "Password changed — please sign in with your new password": { en: "Password changed — please sign in with your new password", zh: "密码已修改，请使用新密码登录" },
  "Password must be 8-72 chars and include both uppercase and lowercase letters and a digit.": { en: "Password must be 8-72 chars and include both uppercase and lowercase letters and a digit.", zh: "密码必须 8-72 位，同时含大小写字母和数字。" },
  "Please enter your current password": { en: "Please enter your current password", zh: "请输入当前密码" },
  "Province": { en: "Province", zh: "省份" },
  "Request account deletion": { en: "Request account deletion", zh: "申请删除账号" },
  "SKU:": { en: "SKU:", zh: "SKU：" },
  "Save address": { en: "Save address", zh: "保存地址" },
  "Save changes": { en: "Save changes", zh: "保存修改" },
  "Saving…": { en: "Saving…", zh: "保存中…" },
  "Sign in": { en: "Sign in", zh: "登录" },
  "Signing in…": { en: "Signing in…", zh: "登录中…" },
  "Street address (at least 5 characters)": { en: "Street address (at least 5 characters)", zh: "详细地址（至少 5 个字符）" },
  "This address will be the default at checkout": { en: "This address will be the default at checkout", zh: "此地址将在结算时设为默认" },
  "This cannot be undone. Delete the address for {name}?": { en: "This cannot be undone. Delete the address for {name}?", zh: "此操作不可撤销。删除 {name} 的地址？" },
  "To change your email, please contact customer support.": { en: "To change your email, please contact customer support.", zh: "如需修改邮箱，请联系客服。" },
  "Update your name. Your email is your sign-in ID and cannot be changed.": { en: "Update your name. Your email is your sign-in ID and cannot be changed.", zh: "修改你的 姓名。邮箱是登录账号，不可修改。" },
  "Used · saved {amount}": { en: "Used · saved {amount}", zh: "已使用 · 已节省 {amount}" },
  "View all": { en: "View all", zh: "查看全部" },
  "Bag": { en: "Bag", zh: "购物袋" },
  "Bag, {n} items": { en: "Bag, {n} items", zh: "购物袋，{n} 件" },
  "Search products…": { en: "Search products…", zh: "搜索商品…" },
  "What are you looking for?": { en: "What are you looking for?", zh: "你想找什么？" },
  "Close search": { en: "Close search", zh: "关闭搜索" },
  "Popular searches": { en: "Popular searches", zh: "热门搜索" },
  "Apparel": { en: "Apparel", zh: "服饰" },
  "Audio": { en: "Audio", zh: "音频" },
  "Home": { en: "Home", zh: "家居" },
  "Accessories": { en: "Accessories", zh: "配件" },
  "Add To Cart": { en: "Add To Cart", zh: "加入购物袋" },
  "Adding…": { en: "Adding…", zh: "添加中…" },
  "Buy Now": { en: "Buy Now", zh: "立即购买" },
  "Could not add to bag, please try again": { en: "Could not add to bag, please try again", zh: "无法添加到购物袋，请重试" },
  "Could not process, please try again": { en: "Could not process, please try again", zh: "无法处理，请重试" },
  "{n} available": { en: "{n} available", zh: "库存 {n} 件" },
  "{n} sold": { en: "{n} sold", zh: "已售 {n}" },
  "Save {n}%": { en: "Save {n}%", zh: "省 {n}%" },
  "Saved": { en: "Saved", zh: "已收藏" },
  "Add to wishlist": { en: "Add to wishlist", zh: "加入心愿单" },
  "Category": { en: "Category", zh: "分类" },
  "No detailed description available.": { en: "No detailed description available.", zh: "暂无详细描述。" },
  "Showing first {a} of {b} reviews": { en: "Showing first {a} of {b} reviews", zh: "显示前 {a} 条，共 {b} 条评价" },
  "You May Also Like": { en: "You May Also Like", zh: "你可能还喜欢" },
  "Recommended": { en: "Recommended", zh: "为你推荐" },
  "Product not found": { en: "Product not found", zh: "商品未找到" },
  "Privacy Policy: How we collect, use, and protect your personal data": { en: "Privacy Policy: How we collect, use, and protect your personal data", zh: "隐私政策：我们如何收集、使用和保护您的个人数据" },
  "Refund Policy: 7-day no-reason returns, refund conditions, and process": { en: "Refund Policy: 7-day no-reason returns, refund conditions, and process", zh: "退款政策：7 天无理由退货、退款条件和流程" },
  "Terms of Service: please read and agree before using our service": { en: "Terms of Service: please read and agree before using our service", zh: "服务条款：使用服务前请阅读并同意" },
  "Cookie Policy: How we use cookies and similar technologies": { en: "Cookie Policy: How we use cookies and similar technologies", zh: "Cookie 政策：我们如何使用 Cookie 和类似技术" },
  "Your deletion request has been received; we will process it after verification": { en: "Your deletion request has been received; we will process it after verification", zh: "注销申请已收到，核实后我们将处理您的请求" },
  "Create your Ox Shopping account and start shopping.": { en: "Create your Ox Shopping account and start shopping.", zh: "创建 Ox Shopping 商城账户，即刻开启购物。" },
  "items": { en: "items", zh: "件商品" },
  "No matching orders": { en: "No matching orders", zh: "没有匹配的订单" },
  "to": { en: "to", zh: "至" },
  "Shopping bag": { en: "Shopping bag", zh: "购物袋" },
  "Close bag": { en: "Close bag", zh: "关闭购物袋" },
  "Added to bag": { en: "Added to bag", zh: "已加入购物袋" },
  "We use cookies to improve your browsing experience and analyze traffic. Clicking \"Accept all\" means you agree to our use of": { en: "We use cookies to improve your browsing experience and analyze traffic. Clicking \"Accept all\" means you agree to our use of", zh: "我们使用 Cookie 改进浏览体验并分析流量。点击「全部接受」即表示您同意我们的" },
  "Previous": { en: "Previous", zh: "上一页" },
  "Next": { en: "Next", zh: "下一页" },
  "__lang__": { en: "__lang__", zh: "__lang__" },
  "Decrease quantity": { en: "Decrease quantity", zh: "减少数量" },
  "Increase quantity": { en: "Increase quantity", zh: "增加数量" },
  "Refund request submitted; we will review it as soon as possible": { en: "Refund request submitted; we will review it as soon as possible", zh: "退款申请已提交，我们会尽快审核" },
  "Hi {name}": { en: "Hi {name}", zh: "您好，{name}" },
};

/** Translate a key for a given lang.
 *  Resolution order per lang:
 *    - `zh` → DICT[key].zh  (fallback to DICT[key].en, then to key)
 *    - `en` → DICT[key].en  (fallback to DICT[key].zh, then to key)
 *  Fallbacks are only used to prevent raw keys from leaking into the UI; every
 *  shipped entry should define both `zh` and `en`. Supports {placeholder}
 *  interpolation: t("Hi {name}", { name: "X" }, lang). */
export function translate(key: string, lang: Lang, params?: Record<string, string | number>): string {
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
