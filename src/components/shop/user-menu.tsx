"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, LogOut, Package, Ticket, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";
import type { SessionUser } from "@/types/api";

/** Header user area: not logged in → login/register; logged in → account dropdown */
export function UserMenu({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const t = useT();

  if (!user) {
    return (
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-auto p-0 text-sm font-normal text-current opacity-65 hover:bg-transparent hover:opacity-100"
      >
        <Link href="/auth/login">{t("Login")}</Link>
      </Button>
    );
  }

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      toast.success(t("Signed out successfully"));
      window.dispatchEvent(new CustomEvent("auth:logout"));
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Sign-out failed, please try again later"));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto gap-2 p-0 text-sm font-normal text-current opacity-65 hover:bg-transparent hover:opacity-100"
        >
          <UserCircle className="hidden h-5 w-5 sm:block" />
          {/* 对齐官方:固定显示 Account,不渲染用户名(避免长名撑破布局) */}
          <span>{t("Account")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate">
          {user.name ? `${user.name} · ${user.email}` : user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account/profile">
            <UserCircle className="mr-2 h-4 w-4" />
            {t("My Account")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/orders">
            <Package className="mr-2 h-4 w-4" />
            {t("My Orders")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/favorites">
            <Heart className="mr-2 h-4 w-4" />
            {t("My Favorites")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/coupons">
            <Ticket className="mr-2 h-4 w-4" />
            {t("My Coupons")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void handleLogout();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("Sign Out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
