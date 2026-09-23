"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_NAV_GROUPS, isAdminNavActive, type AdminNavItem } from "@/lib/admin-nav";

function SidebarLink({
  item,
  active,
  onNavigate,
}: {
  item: AdminNavItem;
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
          {ADMIN_NAV_GROUPS.map((group, gi) => {
            const items = group.items.filter((item) => !item.adminOnly || isAdmin);
            if (items.length === 0) return null;
            return (
              <div key={group.key} className={gi === 0 ? undefined : "mt-5"}>
                <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <SidebarLink
                      key={item.href}
                      item={item}
                      active={isAdminNavActive(pathname, item.href)}
                      onNavigate={closeDrawer}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
