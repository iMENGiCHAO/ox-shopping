import {
  FolderTree,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  Package,
  RotateCcw,
  Rocket,
  Rss,
  Scale,
  ScrollText,
  Settings,
  Share2,
  ShoppingCart,
  Ticket,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * 后台侧栏导航 —— **单一事实来源**。
 *
 * 桌面固定侧栏（admin-shell-server）与移动端抽屉（admin-mobile-drawer）共用本文件。
 * 此前两处各自维护一份 19 项列表：新增入口要改两遍，漏一处就会出现
 * 「桌面有、手机没有」的隐性缺口（而且两处的顺序已经出现轻微漂移）。
 *
 * ── 分组规则 ────────────────────────────────────────────────────────────────
 * **按业务域分组，不按权限分组**：权限差异用 `adminOnly` 表达。
 * 上一版把 19 项塞进「概览 / 运营管理 / 系统」三组，运营管理里业务域来回跳跃
 * （消息中心 → 分销 → 找回密码 → 退款 → 折扣码 → 支付渠道 → 物流 → 法务 → 设置），
 * 找东西全靠记忆 —— 这是「乱」的根因。
 *
 * 组内顺序 = 运营使用频率（越靠上越高频）；组间顺序 = 从日常经营到系统配置。
 * 权限过滤后**为空的组不渲染标题**（STAFF 不会看到空荡荡的「系统」标题）。
 */
export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 仅 ADMIN 可见（STAFF 隐藏） */
  adminOnly?: boolean;
  /** 待办角标（0/undefined 不显示；由外壳按 href 注入运行时数据） */
  badge?: number;
}

export interface AdminNavGroup {
  key: string;
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    key: "overview",
    label: "概览",
    items: [{ href: "/admin", label: "仪表盘", icon: LayoutDashboard }],
  },
  {
    // 一笔钱的完整旅程：下单 → 履约（物流方式）→ 售后（退款）
    key: "orders",
    label: "订单与售后",
    items: [
      { href: "/admin/orders", label: "订单", icon: ShoppingCart },
      { href: "/admin/refunds", label: "退款", icon: RotateCcw, adminOnly: true },
      { href: "/admin/shipping", label: "物流方式", icon: Truck, adminOnly: true },
    ],
  },
  {
    // 卖什么、怎么分类、缺货了谁在等
    key: "catalog",
    label: "商品与库存",
    items: [
      { href: "/admin/products", label: "商品", icon: Package },
      { href: "/admin/categories", label: "分类", icon: FolderTree },
      { href: "/admin/notify-me", label: "到货提醒", icon: Rss },
    ],
  },
  {
    // 客户侧三件事：谁在我这买（用户）、怎么通知我（消息中心）、谁在等我（找回密码）
    key: "customers",
    label: "客户与客服",
    items: [
      { href: "/admin/users", label: "用户", icon: Users },
      { href: "/admin/notifications", label: "消息中心", icon: MessagesSquare },
      { href: "/admin/password-resets", label: "找回密码", icon: KeyRound, adminOnly: true },
    ],
  },
  {
    // 拉新与让利：分销是平台级资金模块（子页导航由模块内二级 Tab 承担）
    key: "growth",
    label: "营销与分销",
    items: [
      { href: "/admin/distribution", label: "分销", icon: Share2, adminOnly: true },
      { href: "/admin/coupons", label: "折扣码", icon: Ticket, adminOnly: true },
    ],
  },
  {
    // 对外说的话：FAQ 与法务页都直接展示给顾客
    key: "content",
    label: "内容与合规",
    items: [
      { href: "/admin/faqs", label: "FAQ 管理", icon: HelpCircle },
      { href: "/admin/legal", label: "法务页面", icon: Scale, adminOnly: true },
    ],
  },
  {
    // 收钱的通道、全站配置、谁改过什么
    key: "system",
    label: "系统",
    items: [
      // 上线自检：把「能否开门做生意」的阻塞项集中暴露（收款/邮件/域名/默认密码…）
      { href: "/admin/launch-readiness", label: "上线自检", icon: Rocket, adminOnly: true },
      { href: "/admin/payment-channels", label: "支付渠道", icon: Wallet, adminOnly: true },
      { href: "/admin/settings", label: "设置", icon: Settings, adminOnly: true },
      { href: "/admin/audit-logs", label: "审计日志", icon: ScrollText },
    ],
  },
];

/** 扁平化的全量导航项（面包屑标题查找、权限过滤等共用） */
export const ALL_ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

/**
 * 当前路径是否命中该导航项。
 * 仪表盘要精确匹配（否则它作为 `/admin` 前缀会永远高亮）；
 * 其余项命中自身或子路由即算激活（如 `/admin/distribution/rules` → 分销）。
 */
export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}
