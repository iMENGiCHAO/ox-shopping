import * as React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import {
  FolderTree,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Package,
  RotateCcw,
  Rss,
  ScrollText,
  Settings,
  ShoppingCart,
  Ticket,
  Truck,
  Users,
  HelpCircle,
  Wallet,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { brandFallback } from "@/lib/env";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { getLang } from "@/lib/shop-i18n-server";
import type { SessionUser } from "@/types/api";
import { AdminUnreadBell } from "@/components/admin/admin-unread-bell";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";
import {
  AdminSidebarToggle,
  AdminSidebarCollapseButton,
} from "@/components/admin/admin-sidebar-toggle";
import { MobileDrawerContent } from "@/components/admin/admin-mobile-drawer";

/* ────────────────────────────────────────────────────────────────────────────
 * Ox Shopping Admin — 服务端静态外壳
 *
 * 修复 Next.js 16 standalone 模式下 RSC 水合 bug：
 * - 原 AdminShell 作为整体客户端组件，水合时整个布局被丢弃
 * - 新方案：外壳为服务端组件，仅交互小组件为客户端组件
 * - 侧栏折叠通过 body.admin-sidebar-collapsed class + CSS 控制
 * ──────────────────────────────────────────────────────────────────────────── */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

/** 主导航（运营日常高频） */
const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "仪表盘", icon: LayoutDashboard },
  { href: "/admin/products", label: "商品", icon: Package },
  { href: "/admin/categories", label: "分类", icon: FolderTree },
  { href: "/admin/orders", label: "订单", icon: ShoppingCart },
  { href: "/admin/notify-me", label: "到货提醒", icon: Rss },
];

/** 运营管理（ADMIN 专属） */
const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin/notifications", label: "消息中心", icon: MessagesSquare },
  { href: "/admin/refunds", label: "退款", icon: RotateCcw, adminOnly: true },
  { href: "/admin/coupons", label: "折扣码", icon: Ticket, adminOnly: true },
  { href: "/admin/payment-channels", label: "支付渠道", icon: Wallet, adminOnly: true },
  { href: "/admin/shipping", label: "物流方式", icon: Truck, adminOnly: true },
  { href: "/admin/legal", label: "法务页面", icon: Scale, adminOnly: true },
  { href: "/admin/settings", label: "设置", icon: Settings, adminOnly: true },
];

/** ADMIN 二级入口（侧栏底部） */
const ADMIN_TOOLS: NavItem[] = [
  { href: "/admin/users", label: "用户", icon: Users },
  { href: "/admin/audit-logs", label: "审计日志", icon: ScrollText },
  { href: "/admin/faqs", label: "FAQ 管理", icon: HelpCircle },
];

/**
 * 品牌名兜底 —— 后台真实品牌取自站点设置（与前台一致），此处仅作最后兜底。
 * 不要在组件里写死品牌字面量：改一处 `SITE_NAME` / 后台设置即可全站生效。
 */
const BRAND_NAME = brandFallback;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

/** 全部后台导航项（含二级入口），供面包屑按路径取中文标题 */
const ALL_NAV_ITEMS: NavItem[] = [...NAV_ITEMS, ...ADMIN_NAV_ITEMS, ...ADMIN_TOOLS];

/** 面包屑标题：按导航标签取中文；子路由取父级标签，未登记的回退通用文案 */
function adminPageLabel(pathname: string): string {
  if (pathname === "/admin") return "仪表盘";
  const exact = ALL_NAV_ITEMS.find((i) => i.href === pathname);
  if (exact) return exact.label;
  const parent = ALL_NAV_ITEMS.find((i) => pathname.startsWith(i.href + "/"));
  if (parent) return parent.label;
  return "管理后台";
}

/* ─── Sidebar link（pill 激活态）────────────────────────────────────────── */

function SidebarLink({
  item,
  active,
  collapsed = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      title={item.label}
      data-active={active}
      className={cn(
        "group relative flex h-9 items-center rounded-md text-[13px] font-medium",
        "outline-none transition-colors duration-150 ease-out",
        "focus-visible:ring-2 focus-visible:ring-ring/40",
        collapsed ? "justify-center px-0" : "gap-2.5 px-3",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-[15px] w-[15px] shrink-0 transition-colors",
          active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
        strokeWidth={1.75}
      />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}

/* ─── 侧栏内容（服务端静态渲染）──────────────────────────────────────────── */

function SidebarContent({
  isAdmin,
  pathname,
  collapsed,
  brandName = BRAND_NAME,
}: {
  isAdmin: boolean;
  pathname: string;
  collapsed?: boolean;
  /** 站点品牌名（来自站点设置，后台可改） */
  brandName?: string;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2.5 border-b border-border",
          collapsed ? "justify-center px-0" : "px-5",
        )}
      >
        <Link
          href="/admin"
          aria-label={`${brandName} 管理后台`}
          className="flex h-9 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/brand/admin-logo.png"
            alt={brandName}
            className="h-9 w-auto shrink-0"
          />
          {!collapsed ? (
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-semibold tracking-tight text-foreground">
                {brandName}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                管理后台
              </span>
            </div>
          ) : null}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {!collapsed ? (
          <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            概览
          </div>
        ) : null}

        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </div>

        {isAdmin ? (
          <>
            {!collapsed ? (
              <div className="mb-1.5 mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                运营管理
              </div>
            ) : null}
            <div className="space-y-0.5">
              {ADMIN_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </>
        ) : null}

        {isAdmin ? (
          <>
            {!collapsed ? (
              <div className="mb-1.5 mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                系统
              </div>
            ) : null}
            <div className="space-y-0.5">
              {ADMIN_TOOLS.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </>
        ) : null}
      </nav>
    </div>
  );
}

/* ─── Admin Shell 主组件（服务端组件）────────────────────────────────────── */

export async function AdminShellServer({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  // 服务端获取当前路径
  const pathname = (await headers()).get("x-pathname") ?? "/admin";
  const isAdmin = user.role === "ADMIN";

  // 品牌名与前台同源（站点设置，后台可改）；未配置时回落 brandFallback。
  const settings = await getSiteSettings();
  const lang = await getLang();
  const brandName = pickLang(settings.siteName, lang).trim() || BRAND_NAME;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── 桌面固定侧栏 ───────────────────────────────────── */}
      <aside className="admin-sidebar fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-border bg-card transition-[width] duration-200 ease-out lg:flex">
        <SidebarContent isAdmin={isAdmin} pathname={pathname} brandName={brandName} />
        {/* 折叠按钮（侧栏底部，桌面） */}
        <div className="border-t border-border p-2">
          <AdminSidebarCollapseButton />
        </div>
      </aside>

      {/* ── 移动端抽屉侧栏 ─────────────────────────────────── */}
      <MobileDrawerContent isAdmin={isAdmin} pathname={pathname} brandName={brandName} />

      {/* ── 主区域 ─────────────────────────────────────────── */}
      <div className="admin-main flex min-h-screen flex-col lg:pl-[264px]">
        {/* 毛玻璃顶栏 */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md lg:px-7">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* 移动端汉堡按钮 */}
            <button
              type="button"
              className="mobile-drawer-trigger flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
              aria-label="打开菜单"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </button>

            {/* 桌面端侧栏折叠/展开按钮 */}
            <AdminSidebarToggle className="hidden lg:flex" />

            {/* 桌面端 breadcrumb 前缀 */}
            <span className="hidden text-[13px] font-medium text-muted-foreground lg:inline">
              {brandName}
            </span>
            <span className="hidden h-4 w-px bg-border lg:inline-block" aria-hidden />
            {/* 顶栏当前页名：视觉标签，语义标题由各页 AdminPageHeader 的 h1 承担（避免双 h1） */}
            <span
              aria-current="page"
              className="truncate text-[15px] font-semibold tracking-tight text-foreground"
            >
              {adminPageLabel(pathname)}
            </span>
          </div>

          {/* 右侧：提醒 + 用户菜单 */}
          <div className="flex shrink-0 items-center gap-1">
            <AdminUnreadBell isAdmin={user.role === "ADMIN"} />
            <div className="mx-1 hidden h-5 w-px bg-border md:block" aria-hidden />
            <AdminUserMenu user={user} />
          </div>
        </header>

        {/* 内容区 */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
