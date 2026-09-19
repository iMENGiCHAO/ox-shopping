"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";
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

const ROLE_KEYS: Record<string, string> = {
  ADMIN: "管理员",
  SUPPORT: "客服",
  CUSTOMER: "顾客",
};

/**
 * 顶栏用户菜单（客户端组件）
 */
export function AdminUserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const initials = (user.name || user.email || "A").slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      toast.success("已退出登录");
    } catch {
      /* ignore logout API errors */
    }
    router.push("/admin/login");
  };

  return (
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
  );
}
