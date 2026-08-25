"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Lock, MapPin, Ticket, User } from "lucide-react";
import { cn } from "@/lib/utils";

/** 图标名称(服务端只传字符串，组件在客户端映射具体图标，避免跨边界传组件) */
export type AccountNavIcon = "user" | "map-pin" | "lock" | "ticket" | "heart";

const ICONS = { user: User, "map-pin": MapPin, lock: Lock, ticket: Ticket, heart: Heart } as const;

export interface AccountNavLinkProps {
  href: string;
  label: string;
  icon: AccountNavIcon;
}

/** 个人中心侧边导航(客户端：根据当前路径高亮) */
export function AccountNavLink({ href, label, icon }: AccountNavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/account/profile" && pathname.startsWith(href));
  const Icon = ICONS[icon];

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
