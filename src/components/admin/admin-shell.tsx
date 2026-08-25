"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Mail,ChevronsUpDown,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Package,
  RotateCcw,
  ScrollText,
  Settings,
  ShoppingCart,
  Star,
  Store,
  Ticket,
  Users,
  MailOpen,
  type LucideIcon, Images, HelpCircle } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/fetch-client";
import type { SessionUser } from "@/types/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PanelLeftClose } from "lucide-react";
import { useLang } from "@/components/admin/lang-provider";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** ADMIN-only visibility */
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/banners", label: "页面横幅", icon: Images },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/notify-me", label: "到货通知", icon: Bell },
  { href: "/admin/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket, adminOnly: true },
  { href: "/admin/refunds", label: "Refunds", icon: RotateCcw, adminOnly: true },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText, adminOnly: true },
  { href: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
];

const ROLE_KEYS: Record<string, string> = {
  ADMIN: "Administrator",
  SUPPORT: "Support",
  CUSTOMER: "Customer",
};

/** Brand shown in the sidebar — translates with the active language. */
const BRAND_NAME = { zh: "SpaceXAI Shop", en: "SpaceXAI Shop" } as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

/* ─── Sidebar ─────────────────────────────────────────────────────
 * Apple-style light sidebar: white card with subtle border + shadow.
 * Active link uses Apple blue accent — clean and airy.
 * ───────────────────────────────────────────────────────────────── */
function SidebarLink({
  item,
  active,
  collapsed = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
}) {
  const { t } = useLang();
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={t(item.label)}
      title={collapsed ? t(item.label) : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
        collapsed ? "justify-center px-0" : "",
        active
          ? "bg-primary/10 text-primary"
          : "text-foreground/60 hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      {!collapsed ? (
        <>
          {t(item.label)}
          {active ? (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
          ) : null}
        </>
      ) : null}
    </Link>
  );
}

/** Admin shell: Apple light sidebar + top bar + content area */
export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();
  const { t, lang } = useLang();
  const isAdmin = user.role === "ADMIN";
  const visibleItems = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const currentItem = visibleItems.find((i) => isActive(pathname, i.href));
  const isFaqsActive = pathname.startsWith("/admin/faqs");
  const title = currentItem
    ? t(currentItem.label)
    : isFaqsActive
      ? t("FAQ Management")
      : t("Dashboard");

  /* ─── Sidebar collapse (persisted in localStorage) ─── */
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try { if (localStorage.getItem("admin-sidebar-collapsed") === "1") setCollapsed(true); } catch {}
  }, []);
  const toggleCollapse = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("admin-sidebar-collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);
  const sidebarWidth = collapsed ? "w-16" : "w-60";
  const sidebarPad = collapsed ? "lg:pl-16" : "lg:pl-60";

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      toast.success(t("Signed out"));
    } catch {
      /* ignore logout API errors, still navigate to login */
    }
    router.push("/admin/login");
  };

  const initials = (user.name || user.email || "A").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Desktop sidebar — Apple light panel (collapsible) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-card transition-[width] duration-200 ease-in-out lg:flex",
          sidebarWidth
        )}
      >
        <Link
          href="/admin"
          className="flex items-center gap-2.5 border-b border-border px-4 py-5"
          title={collapsed ? `${BRAND_NAME[lang]} ${t("Admin")}` : undefined}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <Store className="h-5 w-5" />
          </span>
          <div className={cn("flex flex-col leading-none transition-opacity", collapsed ? "hidden" : "")}>
            <span className="text-sm font-bold tracking-tight text-foreground">{BRAND_NAME[lang]}</span>
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t("Admin")}
            </span>
          </div>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {visibleItems.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>
        <div className="border-t border-border px-3 py-3 text-[11px] text-muted-foreground">
          <div className={cn("truncate", collapsed ? "sr-only" : "")}>
            {user.name} &middot; {t(ROLE_KEYS[user.role] ?? user.role)}
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200 ease-in-out", sidebarPad)}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md lg:px-6">
          <div className="flex items-center gap-3">
            {/* Collapse toggle (desktop only) */}
            <button
              onClick={toggleCollapse}
              aria-label={collapsed ? t("Expand Sidebar") : t("Collapse Sidebar")}
              title={collapsed ? t("Expand Sidebar") : t("Collapse Sidebar")}
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
            >
              <PanelLeftClose
                className={cn("h-4 w-4 transition-transform", collapsed ? "rotate-180" : "")}
              />
            </button>
            <Link href="/admin" className="flex items-center gap-2 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Store className="h-4 w-4" />
              </span>
            </Link>
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* FAQ 管理快捷入口(与账号区同行,圆形与头像一致) */}
            <Link
              href="/admin/faqs"
              aria-label={t("FAQ Management")}
              title={t("FAQ Management")}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                isFaqsActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <HelpCircle className="h-4 w-4" />
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-muted">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted text-[11px] font-medium text-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[120px] truncate sm:block text-foreground/80">
                    {user.name}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">{user.name}</div>
                  <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  {t("Role")}: {t(ROLE_KEYS[user.role] ?? user.role)}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account/profile">{t("Account Settings")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/">{t("returns to Store")}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => void handleLogout()}
                >
                  <LogOut className="h-4 w-4" />
                  {t("Sign Out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile horizontal nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-border/60 bg-background px-3 py-2 lg:hidden">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                isActive(pathname, item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t(item.label)}
            </Link>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
