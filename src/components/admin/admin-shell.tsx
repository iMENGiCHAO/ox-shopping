"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronsUpDown,
  FolderTree,
  LayoutDashboard,
  LogOut,
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
  CreditCard,
  type LucideIcon,
  Scale,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/fetch-client";
import type { SessionUser } from "@/types/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ────────────────────────────────────────────────────────────────────────────
 * Ox Shopping Admin — 现代 SaaS 后台 (2024-2026 一线范式)
 *
 * 设计参考：Vercel × Linear × Notion
 *   - 全高白色侧栏 + 右侧 1px 分割，导航项 pill 激活态（柔和 tinted bg）
 *   - 顶栏毛玻璃 backdrop-blur，内容区冷调浅灰底 + 白卡片
 *   - 圆角 8px 系统、柔和多层阴影（.admin-theme 作用域令牌）
 *   - 移动端：汉堡按钮 → 左侧抽屉侧栏（替换旧横向滚动 nav）
 *
 * 商业策略不变：后台统一中文、品牌名固定 "Ox Shopping"
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
  { href: "/admin/coupons", label: "优惠券", icon: Ticket, adminOnly: true },
  { href: "/admin/refunds", label: "退款", icon: RotateCcw, adminOnly: true },
  { href: "/admin/payments", label: "支付网关", icon: CreditCard, adminOnly: true },
  { href: "/admin/shipping", label: "物流方式", icon: Truck, adminOnly: true },
  { href: "/admin/legal", label: "法务页面", icon: Scale, adminOnly: true },
  { href: "/admin/settings", label: "设置", icon: Settings, adminOnly: true },
];

/** ADMIN 二级入口（侧栏底部 + 顶栏快捷） */
const ADMIN_TOOLS = [
  { href: "/admin/users", label: "用户", icon: Users },
  { href: "/admin/audit-logs", label: "审计日志", icon: ScrollText },
  { href: "/admin/faqs", label: "FAQ 管理", icon: HelpCircle },
];

const ROLE_KEYS: Record<string, string> = {
  ADMIN: "管理员",
  SUPPORT: "客服",
  CUSTOMER: "顾客",
};

const BRAND_NAME = "Ox Shopping";

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

/* ─── Sidebar link（pill 激活态；collapsed 时仅图标居中）────────────────── */

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
        "transition-colors duration-150 ease-out outline-none",
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

/* ─── 侧栏内容（桌面固定侧栏 + 移动抽屉共用）────────────────────────────── */

function SidebarContent({
  isAdmin,
  pathname,
  collapsed,
  onNavigate,
}: {
  isAdmin: boolean;
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
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
          onClick={onNavigate}
          aria-label={`${BRAND_NAME} 管理后台`}
          className="flex h-9 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/brand/admin-logo.png" alt={BRAND_NAME} className="h-9 w-auto shrink-0" />
          {!collapsed ? (
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-semibold tracking-tight text-foreground">
                {BRAND_NAME}
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
            ) : (
              <div className="mx-2 my-3 h-px bg-border" aria-hidden />
            )}
            <div className="space-y-0.5">
              {ADMIN_NAV_ITEMS.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                />
              ))}
            </div>
          </>
        ) : null}

        {/* 二级工具（用户/审计/FAQ），SUPPORT 亦可见 */}
        {!collapsed ? (
          <div className="mb-1.5 mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            系统
          </div>
        ) : (
          <div className="mx-2 my-3 h-px bg-border" aria-hidden />
        )}
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
      </nav>
    </div>
  );
}

/* ─── AdminShell ────────────────────────────────────────────────────────── */

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();
  const isAdmin = user.role === "ADMIN";
  const title = [...NAV_ITEMS, ...ADMIN_NAV_ITEMS, ...ADMIN_TOOLS].find((i) =>
    isActive(pathname, i.href),
  )?.label ?? "仪表盘";

  /* 桌面侧栏折叠（持久化） */
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      if (localStorage.getItem("admin-sidebar-collapsed") === "1") setCollapsed(true);
    } catch {}
  }, []);
  const toggleCollapse = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin-sidebar-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  /* 移动端抽屉侧栏 */
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const closeDrawer = React.useCallback(() => setDrawerOpen(false), []);
  // 路由切换时自动关闭抽屉
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);
  // Esc 关闭 + body 滚动锁定
  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const sidebarWidth = collapsed ? "lg:w-[72px]" : "lg:w-[264px]";
  const mainPad = collapsed ? "lg:pl-[72px]" : "lg:pl-[264px]";

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      toast.success("已退出登录");
    } catch {
      /* ignore logout API errors */
    }
    router.push("/admin/login");
  };

  const initials = (user.name || user.email || "A").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── 桌面固定侧栏 ───────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-card transition-[width] duration-200 ease-out lg:flex",
          sidebarWidth,
        )}
      >
        <SidebarContent
          isAdmin={isAdmin}
          pathname={pathname}
          collapsed={collapsed}
        />
        {/* 折叠按钮（侧栏底部，桌面） */}
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            title={collapsed ? "展开侧栏" : "收起侧栏"}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[12px] text-muted-foreground transition-colors",
              "hover:bg-secondary/60 hover:text-foreground",
              collapsed && "justify-center",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
                <span>收起侧栏</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── 移动端抽屉侧栏 ─────────────────────────────────── */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={closeDrawer}
            aria-hidden
          />
          {/* panel */}
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-overlay">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/brand/admin-logo.png"
                  alt={BRAND_NAME}
                  className="h-8 w-auto"
                />
                <span className="text-[13px] font-semibold tracking-tight">{BRAND_NAME}</span>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="关闭菜单"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <SidebarContent
              isAdmin={isAdmin}
              pathname={pathname}
              onNavigate={closeDrawer}
            />
          </div>
        </div>
      ) : null}

      {/* ── 主区域 ─────────────────────────────────────────── */}
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200 ease-out",
          mainPad,
        )}
      >
        {/* 毛玻璃顶栏 */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md lg:px-7">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* 移动端汉堡按钮 */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="打开菜单"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </button>

            {/* 桌面端侧栏折叠/展开按钮 */}
            <button
              type="button"
              onClick={toggleCollapse}
              aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
              title={collapsed ? "展开侧栏" : "收起侧栏"}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:flex"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-[16px] w-[16px]" strokeWidth={1.75} />
              ) : (
                <PanelLeftClose className="h-[16px] w-[16px]" strokeWidth={1.75} />
              )}
            </button>

            {/* 桌面端 breadcrumb 前缀 */}
            <span className="hidden text-[13px] font-medium text-muted-foreground lg:inline">
              {BRAND_NAME}
            </span>
            <span className="hidden h-4 w-px bg-border lg:inline-block" aria-hidden />
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {title}
            </h1>
          </div>

          {/* 右侧：提醒 + 用户菜单（用户/审计/FAQ 等入口已在侧栏，不再重复） */}
          <div className="flex shrink-0 items-center gap-1">
            <UnreadBell />

            <div className="mx-1 hidden h-5 w-px bg-border md:block" aria-hidden />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md pl-1 pr-2 outline-none transition-colors",
                    "hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring/40",
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-secondary text-[11px] font-semibold text-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-[13px] font-medium text-foreground md:inline">
                    {user.name}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <div className="text-[13px] font-semibold">{user.name}</div>
                  <div className="truncate text-[11px] font-normal text-muted-foreground">
                    {user.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-[12px] text-muted-foreground">
                  角色：{ROLE_KEYS[user.role] ?? user.role}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account/profile">账号设置</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/">返回前台</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => void handleLogout()}
                >
                  <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* 内容区 */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

/**
 * 顶栏提醒 Bell — 消息中心入口。
 * 角标 = 站内通知未读数（新订单/退款申请/新用户/补货提醒）
 *        + 未读订单数 + 待退款数；每 30s 拉一次。
 */
function UnreadBell() {
  const [unread, setUnread] = React.useState<{
    messages: number;
    orders: number;
    refunds: number;
  } | null>(null);
  React.useEffect(() => {
    let active = true;
    const fetchCount = async () => {
      try {
        const [msg, o] = await Promise.all([
          apiFetch<{ unreadCount: number }>("/api/admin/notifications"),
          apiFetch<{ unreadOrders: number; pendingRefunds: number }>("/api/admin/orders/unread"),
        ]);
        if (active)
          setUnread({
            messages: msg.unreadCount ?? 0,
            orders: o.unreadOrders ?? 0,
            refunds: o.pendingRefunds ?? 0,
          });
      } catch {
        /* 静默 */
      }
    };
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  const total =
    (unread?.messages ?? 0) + (unread?.orders ?? 0) + (unread?.refunds ?? 0);
  return (
    <Link
      href="/admin/notifications"
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground",
        total > 0 && "text-foreground",
      )}
      aria-label={`${total} 条待处理提醒`}
      title="消息中心（订单/退款/新用户/补货提醒）"
    >
      <Bell className="h-[16px] w-[16px]" strokeWidth={1.75} />
      {total > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground shadow-sm">
          {total > 99 ? "99+" : total}
        </span>
      ) : null}
    </Link>
  );
}