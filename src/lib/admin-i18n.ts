/** Admin i18n — minimal zh/en dictionary + helpers.
 * Language state is managed by LangProvider (client context).
 * The dictionary keys are terse English source strings (used as fallback zh). */

export type Lang = "zh" | "en";

export const LANGS: Lang[] = ["zh", "en"];

export const LANG_LABEL: Record<Lang, string> = {  zh: "中文",
  en: "English",
};

/** Dictionary entry shape: source-key → per-lang string. */
type Dict = Record<string, Partial<Record<Lang, string>>>;

/** The full admin string catalog. Key is the English source string;
 *  `zh` provides the Chinese rendering. */
const DICT: Dict = {
  /* ── Sidebar nav (admin-shell) ─────────────────────────────────── */
  Dashboard: { zh: "仪表盘" },
  Products: { zh: "商品" },
  Categories: { zh: "分类" },
  Reviews: { zh: "评价" },
  Users: { zh: "用户" },
  Coupons: { zh: "优惠券" },
  Refunds: { zh: "退款" },
  "Audit Logs": { en: "Audit Logs", zh: "审计日志" },
  Settings: { zh: "设置" },
  "Collapse Sidebar": { en: "Collapse Sidebar", zh: "收起侧边栏" },
  "Expand Sidebar": { en: "Expand Sidebar", zh: "展开侧边栏" },
  "Toggle sidebar width": { en: "Toggle sidebar width", zh: "切换侧边栏宽度" },
  Admin: { zh: "管理" },
  "returns to Store": { en: "returns to Store", zh: "返回店铺" },
  "Sign Out": { en: "Sign Out", zh: "退出登录" },
  "Account Settings": { en: "Account Settings", zh: "账号设置" },
  Administrator: { zh: "管理员" },
  Support: { zh: "客服" },
  Customer: { zh: "顾客" },
  Role: { zh: "角色" },
  "Signed out": { en: "Signed out", zh: "已退出" },

  /* ── Dashboard (admin/page.tsx) ────────────────────────────────── */
  "Total Revenue": { en: "Total Revenue", zh: "总营收" },
  Orders: { zh: "订单数" },
  "Pending Shipments": { en: "Pending Shipments", zh: "待发货" },
  "Low Stock": { en: "Low Stock", zh: "低库存" },
  "Sales Trend": { en: "Sales Trend", zh: "销售趋势" },
  "Recent Orders": { en: "Recent Orders", zh: "最近订单" },
  "Top Products": { en: "Top Products", zh: "热销商品" },
  "Pending Review": { en: "Pending Review", zh: "待审核" },
  "Inventory Alerts": { en: "Inventory Alerts", zh: "库存预警" },
  "View all": { en: "View all", zh: "查看全部" },
  "No data yet": { en: "No data yet", zh: "暂无数据" },
  "Last 7 days": { en: "Last 7 days", zh: "最近 7 天" },
  "Last 30 days": { en: "Last 30 days", zh: "最近 30 天" },
  "Store performance overview": { en: "Store performance overview", zh: "店铺运营概览" },
  "Today": { en: "Today", zh: "今日" },
  "showed": { en: "showed", zh: "已售" },
  "sold": { en: "sold", zh: "已售" },
  "days": { en: "days", zh: "天" },
  "in stock": { en: "in stock", zh: "库存中" },
  "live": { en: "live", zh: "在线" },

  /* ── Common actions ────────────────────────────────────────────── */
  Create: { zh: "新建" },
  Edit: { en: "Edit", zh: "编辑" },
  Delete: { en: "Delete", zh: "删除" },
  Save: { zh: "保存" },
  Cancel: { zh: "取消" },
  Confirm: { zh: "确认" },
  Search: { zh: "搜索" },
  Filter: { zh: "筛选" },
  "Apply": { en: "Apply", zh: "应用" },
  "Reset": { en: "Reset", zh: "重置" },
  "Back": { en: "Back", zh: "返回" },
  Submit: { zh: "提交" },
  Close: { zh: "关闭" },
  "View Details": { en: "View Details", zh: "查看详情" },
  Status: { zh: "状态" },
  Actions: { zh: "操作" },
  Name: { zh: "名称" },
  Price: { zh: "价格" },
  Stock: { zh: "库存" },
  Category: { zh: "分类" },
  "Created At": { en: "Created At", zh: "创建时间" },
  "Updated At": { en: "Updated At", zh: "更新时间" },
  SKU: { zh: "SKU" },
  Image: { zh: "图片" },
  Description: { zh: "描述" },
  Slug: { zh: "路径标识" },

  /* ── Products page ─────────────────────────────────────────────── */
  "New Product": { en: "New Product", zh: "新增商品" },
  "Edit Product": { en: "Edit Product", zh: "编辑商品" },
  Editing: { en: "Editing", zh: "正在编辑" },
  "Fields marked * are required": { en: "Fields marked * are required", zh: "带 * 的字段为必填项" },
  ProductName: { en: "Product Name", zh: "商品名称" },
  "Price (amount)": { en: "Price (amount)", zh: "价格" },
  "Compare-at price (amount, optional)": { en: "Compare-at price (amount, optional)", zh: "划线价（可不填）" },
  "Cost price (amount, optional)": { en: "Cost price (amount, optional)", zh: "成本价（可不填）" },
  "Product description": { en: "Product description", zh: "商品描述" },
  "Product images": { en: "Product images", zh: "商品图片" },
  "(not editable)": { en: "(not editable)", zh: "（不可修改）" },
  Archived: { en: "Archived", zh: "已归档" },
  "Create product": { en: "Create product", zh: "创建商品" },
  "Save changes": { en: "Save changes", zh: "保存修改" },
  "FAQ Management": { en: "FAQ Management", zh: "FAQ 管理" },
  "Manage storefront FAQs and the contact block shown under them": { en: "Manage storefront FAQs and the contact block shown under them", zh: "维护前台 FAQ 列表与其下方的联系我们板块" },
  "New FAQ": { en: "New FAQ", zh: "新增 FAQ" },
  "Edit FAQ": { en: "Edit FAQ", zh: "编辑 FAQ" },
  "No FAQs yet": { en: "No FAQs yet", zh: "暂无 FAQ" },
  "Click New FAQ to add your first entry": { en: "Click New FAQ to add your first entry", zh: "点击「新增 FAQ」创建第一条内容" },
  "Please fill in question and answer": { en: "Please fill in question and answer", zh: "请填写问题和答案" },
  "FAQ updated": { en: "FAQ updated", zh: "FAQ 已更新" },
  "FAQ created": { en: "FAQ created", zh: "FAQ 已创建" },
  "FAQ deleted": { en: "FAQ deleted", zh: "FAQ 已删除" },
  "Delete this FAQ?": { en: "Delete this FAQ?", zh: "确定删除这条 FAQ 吗？" },
  "Contact block (under FAQs)": { en: "Contact block (under FAQs)", zh: "联系我们板块（FAQ 页底部）" },
  "Shown at the bottom of the storefront FAQs page": { en: "Shown at the bottom of the storefront FAQs page", zh: "展示在前台 FAQ 页面底部" },
  "Heading": { en: "Heading", zh: "标题" },
  "Body": { en: "Body", zh: "正文" },
  "Contact section saved": { en: "Contact section saved", zh: "联系我们板块已保存" },
  "Sort order": { en: "Sort order", zh: "排序" },
  "Publish": { en: "Publish", zh: "发布" },
  "Saving…": { en: "Saving…", zh: "保存中…" },
  "Save failed, please retry": { en: "Save failed, please retry", zh: "保存失败，请重试" },
  "Edit the storefront Privacy / Terms / Refund / Cookie policy content here.": { en: "Edit the storefront Privacy / Terms / Refund / Cookie policy content here. Supports Markdown-style headings, lists, and blank lines.", zh: "在此编辑店面的隐私政策／服务条款／退款政策／Cookie 政策内容。支持标题、列表与空行分段。" },
  "Product created": { en: "Product created", zh: "商品已创建" },
  "Product updated": { en: "Product updated", zh: "商品已更新" },
  "Product deleted": { en: "Product deleted", zh: "商品已删除" },
  "Stock updated": { en: "Stock updated", zh: "库存已更新" },
  "Delete Product": { en: "Delete Product", zh: "删除商品" },
  "Product Name": { en: "Product Name", zh: "商品名称" },
  "Compare-at Price": { en: "Compare-at Price", zh: "划线价" },
  "Product Images": { en: "Product Images", zh: "商品图片" },
  "Drop images here or click to upload": { en: "Drop images here or click to upload", zh: "拖拽图片到此处或点击上传" },
  "Active": { en: "Active", zh: "上架" },
  "Draft": { en: "Draft", zh: "草稿" },
  "Delete product": { en: "Delete product", zh: "删除商品" },
  'Are you sure you want to delete product "{name}"? This action cannot be undone.': { en: 'Are you sure you want to delete product "{name}"? This action cannot be undone.', zh: '确定要删除商品“{name}”吗？此操作不可撤销。' },
  'Updated {n} product(s) to "{status}"': { en: 'Updated {n} product(s) to "{status}"', zh: '已将 {n} 个商品更新为「{status}」' },
  '"{name}" updated to "{status}"': { en: '"{name}" updated to "{status}"', zh: '「{name}」已更新为「{status}」' },
  "Inactive": { en: "Inactive", zh: "下架" },
  "Out of Stock": { en: "Out of Stock", zh: "缺货" },
  "In Stock": { en: "In Stock", zh: "有货" },
  "Published": { en: "Published", zh: "已发布" },

  /* ── Categories page ───────────────────────────────────────────── */
  "New Category": { en: "New Category", zh: "新增分类" },
  "Edit Category": { en: "Edit Category", zh: "编辑分类" },
  "Delete Category": { en: "Delete Category", zh: "删除分类" },
  "Parent Category": { en: "Parent Category", zh: "父级分类" },
  "None (top-level)": { en: "None (top-level)", zh: "无（顶级）" },

  /* ── Orders page ───────────────────────────────────────────────── */
  "Order #": { en: "Order #", zh: "订单号" },
  Total: { zh: "总计" },
  Date: { zh: "日期" },
  "Ship Order": { en: "Ship Order", zh: "发货" },
  "Mark as Shipped": { en: "Mark as Shipped", zh: "标记为已发货" },
  "Tracking Number": { en: "Tracking Number", zh: "物流单号" },
  "Carrier": { en: "Carrier", zh: "承运商" },
  Pending: { zh: "待处理" },
  Paid: { zh: "已支付" },
  Shipped: { zh: "已发货" },
  Completed: { zh: "已完成" },
  Cancelled: { zh: "已取消" },
  Refunded: { zh: "已退款" },

  /* ── Reviews page ─────────────────────────────────────────────── */
  Rating: { zh: "评分" },
  "Review Content": { en: "Review Content", zh: "评价内容" },
  Approved: { zh: "已通过" },
  Approve: { zh: "通过" },
  Reject: { zh: "拒绝" },

  /* ── Users page ───────────────────────────────────────────────── */
  Email: { zh: "邮箱" },
  "User Name": { en: "User Name", zh: "用户名" },
  "New User": { en: "New User", zh: "新增用户" },
  "Edit User": { en: "Edit User", zh: "编辑用户" },
  "Delete User": { en: "Delete User", zh: "删除用户" },
  "Assign Role": { en: "Assign Role", zh: "分配角色" },

  /* ── Coupons page ─────────────────────────────────────────────── */
  "New Coupon": { en: "New Coupon", zh: "新增优惠券" },
  "Edit Coupon": { en: "Edit Coupon", zh: "编辑优惠券" },
  "Delete Coupon": { en: "Delete Coupon", zh: "删除优惠券" },
  Code: { zh: "兑换码" },
  "Discount Type": { en: "Discount Type", zh: "折扣类型" },
  "Discount Value": { en: "Discount Value", zh: "折扣值" },
  "Min Order Amount": { en: "Min Order Amount", zh: "最低订单金额" },
  "Usage Limit": { en: "Usage Limit", zh: "使用上限" },
  "Used Count": { en: "Used Count", zh: "已用次数" },
  "Valid From": { en: "Valid From", zh: "生效日期" },
  "Valid Until": { en: "Valid Until", zh: "失效日期" },
  Percentage: { zh: "百分比" },
  "Fixed Amount": { en: "Fixed Amount", zh: "固定金额" },

  /* ── Refunds page ─────────────────────────────────────────────── */
  "Refund #": { en: "Refund #", zh: "退款号" },
  "Refund Amount": { en: "Refund Amount", zh: "退款金额" },
  "Reason": { en: "Reason", zh: "原因" },
  "Refund Review": { en: "Refund Review", zh: "退款审核" },
  "Refund Approve": { en: "Refund Approve", zh: "同意退款" },
  "Refund Reject": { en: "Refund Reject", zh: "驳回退款" },
  Requested: { zh: "申请中" },
  "Review Notes": { en: "Review Notes", zh: "审核备注" },

  /* ── Audit Logs page ─────────────────────────────────────────── */
  Action: { zh: "动作" },
  Actor: { zh: "操作人" },
  Target: { zh: "对象" },
  "IP Address": { en: "IP Address", zh: "IP 地址" },

  /* ── Settings page ────────────────────────────────────────────── */
  "Site Settings": { en: "Site Settings", zh: "站点设置" },
  "Site Name": { en: "Site Name", zh: "站点名称" },
  "Site Description": { en: "Site Description", zh: "站点描述" },
  "Contact Email": { en: "Contact Email", zh: "联系邮箱" },
  "Contact Phone": { en: "Contact Phone", zh: "联系电话" },
  "SEO Keywords": { en: "SEO Keywords", zh: "SEO 关键词" },
  "Save Changes": { en: "Save Changes", zh: "保存修改" },
  "Settings saved": { en: "Settings saved", zh: "设置已保存" },

  "Manage product info, stock and listing status": { en: "Manage product info, stock and listing status", zh: "管理商品信息、库存和上下架状态" },
  "Manage product category hierarchy, ordering and active state": { en: "Manage product category hierarchy, ordering and active state", zh: "管理商品分类层级、排序及启用状态" },
  "View orders, advance status and ship": { en: "View orders, advance status and ship", zh: "查看订单、推进状态和发货" },
  "View and moderate customer product reviews": { en: "View and moderate customer product reviews", zh: "查看并审核顾客商品评价" },
  "View user info, order history and account status": { en: "View user info, order history and account status", zh: "查看用户信息、订单历史及账户状态" },
  "Create and manage promotional coupons": { en: "Create and manage promotional coupons", zh: "创建和管理促销优惠券" },
  "Review customer refund requests and track progress": { en: "Review customer refund requests and track progress", zh: "审核客户退款申请并跟踪处理进度" },
  "Sensitive admin operations for security auditing and compliance": { en: "Sensitive admin operations for security auditing and compliance", zh: "敏感操作的安全审计与合规记录" },
  "Manage site info and SEO configuration": { en: "Manage site info and SEO configuration", zh: "管理站点信息与 SEO 配置" },
  "Site information": { en: "Site information", zh: "站点信息" },
  "Basic info shown in the site footer and contact page": { en: "Basic info shown in the site footer and contact page", zh: "显示在页脚和联系页面的基本信息" },
  "Policy pages": { en: "Policy pages", zh: "政策页面" },
  "SEO settings": { en: "SEO settings", zh: "SEO 设置" },
  "Search engine keyword configuration": { en: "Search engine keyword configuration", zh: "搜索引擎关键词配置" },
  "Keywords (comma-separated)": { en: "Keywords (comma-separated)", zh: "关键词（逗号分隔）" },
  "ICP filing number": { en: "ICP filing number", zh: "ICP 备案号" },
  "Privacy policy": { en: "Privacy policy", zh: "隐私政策" },
  "Terms of service": { en: "Terms of service", zh: "服务条款" },
  "Refund policy": { en: "Refund policy", zh: "退款政策" },
  "Cookie policy": { en: "Cookie policy", zh: "Cookie 政策" },
  "Payment / email / storage sensitive config": { en: "Payment / email / storage sensitive config", zh: "支付 / 邮件 / 存储敏感配置" },
  "Failed to save settings": { en: "Failed to save settings", zh: "保存设置失败" },

  /* ── Misc / dialogs ───────────────────────────────────────────── */
  "Are you sure?": { en: "Are you sure?", zh: "确定吗？" },
  "This action cannot be undone.": { en: "This action cannot be undone.", zh: "此操作无法撤销。" },
  "Demo account": { en: "Demo account", zh: "演示账号" },
  "Sign In": { en: "Sign In", zh: "登录" },
  "Sign in with your administrator account": { en: "Sign in with your administrator account", zh: "请使用管理员账户登录" },
  Password: { zh: "密码" },
  "Email is required": { en: "Email is required", zh: "邮箱必填" },
  "Password is required": { en: "Password is required", zh: "密码必填" },
  "Welcome back": { en: "Welcome back", zh: "欢迎回来" },
  "This account does not have admin access": { en: "This account does not have admin access", zh: "此账户没有管理员权限" },
  "Sign in failed, please try again": { en: "Sign in failed, please try again", zh: "登录失败，请重试" },
};

/** Translate a key for a given lang.
 *  Resolution order per lang:
 *    - `zh` → DICT[key].zh  (fallback to DICT[key].en, then to key)
 *    - `en` → DICT[key].en  (fallback to DICT[key].zh, then to key)
 *  Fallbacks are only used to prevent raw keys from leaking into the UI. */
export function translate(key: string, lang: Lang): string {
  const entry = DICT[key];
  if (!entry) return key;
  if (lang === "en") return entry.en ?? entry.zh ?? key;
  return entry.zh ?? entry.en ?? key;
}
