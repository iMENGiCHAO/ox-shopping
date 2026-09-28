"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Heart, Lock, MapPin, Package, Star, Ticket, User } from "lucide-react";
import { cn } from "@/lib/utils";

/** 图标名称(服务端只传字符串，组件在客户端映射具体图标，避免跨边界传组件) */
export type AccountNavIcon =
  | "user"
  | "map-pin"
  | "lock"
  | "ticket"
  | "heart"
  | "star"
  | "orders"
  | "bell";

const ICONS = {
  user: User,
  "map-pin": MapPin,
  lock: Lock,
  ticket: Ticket,
  heart: Heart,
  orders: Package,
  star: Star,
  bell: Bell,
} as const;

export interface AccountNavLinkProps {
  href: string;
  label: string;
  /** 移动端超窄屏（<sm）的短标签；缺省 = 用 label */
  shortLabel?: string;
  icon: AccountNavIcon;
}

/** 个人中心侧边导航(客户端：根据当前路径高亮) */
export function AccountNavLink({ href, label, shortLabel, icon }: AccountNavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/account/profile" && pathname.startsWith(href));
  const Icon = ICONS[icon];

  return (
    <Link
      href={href}
      className={cn(
        // 移动端：单行不换行 + 紧凑 padding（不挤压）
        // 桌面端：常规显示
        "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {/* 移动端（<sm）显示短标签，桌面（≥sm）显示完整标签 */}
      <span className="sm:hidden">{shortLabel ?? label}</span>
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
