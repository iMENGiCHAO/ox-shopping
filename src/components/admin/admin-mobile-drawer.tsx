"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderTree,
  Inbox,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  Package,
  RotateCcw,
  Rss,
  ScrollText,
  Settings,
  Share2,
  ShoppingCart,
  Ticket,
  Truck,
  Users,
  HelpCircle,
  Wallet,
  Scale,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "仪表盘", icon: LayoutDashboard },
  { href: "/admin/products", label: "商品", icon: Package },
  { href: "/admin/categories", label: "分类", icon: FolderTree },
  { href: "/admin/orders", label: "订单", icon: ShoppingCart },
  { href: "/admin/contact-messages", label: "客服留言", icon: Inbox },
  { href: "/admin/notify-me", label: "到货提醒", icon: Rss },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin/notifications", label: "消息中心", icon: MessagesSquare },
  // 与桌面侧栏同一份顺序：分销紧跟消息中心，找回密码在后
  { href: "/admin/distribution", label: "分销", icon: Share2, adminOnly: true },
  { href: "/admin/password-resets", label: "找回密码", icon: KeyRound, adminOnly: true },
  { href: "/admin/refunds", label: "退款", icon: RotateCcw, adminOnly: true },
  { href: "/admin/coupons", label: "折扣码", icon: Ticket, adminOnly: true },
  { href: "/admin/payment-channels", label: "支付渠道", icon: Wallet, adminOnly: true },
  { href: "/admin/shipping", label: "物流方式", icon: Truck, adminOnly: true },
  { href: "/admin/legal", label: "法务页面", icon: Scale, adminOnly: true },
  { href: "/admin/settings", label: "设置", icon: Settings, adminOnly: true },
];

const ADMIN_TOOLS: NavItem[] = [
  { href: "/admin/users", label: "用户", icon: Users },
  { href: "/admin/audit-logs", label: "审计日志", icon: ScrollText },
  { href: "/admin/faqs", label: "FAQ 管理", icon: HelpCircle },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

function SidebarLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-label={item.label}
      title={item.label}
      data-active={active}
      className={cn(
        "group relative flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] font-medium",
        "outline-none transition-colors duration-150 ease-out",
        "focus-visible:ring-2 focus-visible:ring-ring/40",
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
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * 移动端抽屉侧栏（客户端组件）
 * 通过点击 .mobile-drawer-trigger 按钮打开
 */
export function MobileDrawerContent({
  isAdmin,
  pathname: initialPathname,
  brandName,
}: {
  isAdmin: boolean;
  pathname: string;
  /**
   * 站点品牌名 —— 必填。客户端组件读不到站点设置（服务端缓存 + env 均不可用），
   * 因此品牌名一律由服务端外壳 `AdminShellServer` 注入，此处不留任何品牌字面量。
   */
  brandName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname() || initialPathname;

  // 监听 .mobile-drawer-trigger 按钮点击
  React.useEffect(() => {
    const triggers = document.querySelectorAll(".mobile-drawer-trigger");
    const handlers: Array<() => void> = [];
    triggers.forEach((btn) => {
      const handler = () => setOpen(true);
      btn.addEventListener("click", handler);
      handlers.push(handler);
    });
    return () => {
      triggers.forEach((btn, i) => {
        btn.removeEventListener("click", handlers[i]!);
      });
    };
  }, []);

  // 路由切换时自动关闭抽屉
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc 关闭 + body 滚动锁定
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const closeDrawer = () => setOpen(false);

  return (
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
            <img src="/images/brand/admin-logo.png" alt={brandName} className="h-8 w-auto" />
            <span className="text-[13px] font-semibold tracking-tight">{brandName}</span>
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
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            概览
          </div>
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
                onNavigate={closeDrawer}
              />
            ))}
          </div>

          {isAdmin ? (
            <>
              <div className="mb-1.5 mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                运营管理
              </div>
              <div className="space-y-0.5">
                {ADMIN_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                    onNavigate={closeDrawer}
                  />
                ))}
              </div>

              <div className="mb-1.5 mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                系统
              </div>
              <div className="space-y-0.5">
                {ADMIN_TOOLS.map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                    onNavigate={closeDrawer}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
