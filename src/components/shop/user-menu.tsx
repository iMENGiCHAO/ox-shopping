"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/shop/lang-provider";
import type { SessionUser } from "@/types/api";

/**
 * Header user area — 官方单链接（非下拉菜单）：
 * 未登录 → /auth/login；已登录 → /account。
 * 订单/退出登录已收进个人中心右侧导航（/account 布局）。
 *
 * 已登录时，未读消息数字以 `Account (n)` 文字形式显示（与 CartBadge 一致），
 * 30s 拉一次 /api/notifications；0 时不显示括号数字。
 * 点击 Account 即进入个人中心（消息中心是默认第一个 tab）。
 *
 * initialUnread：服务端首屏就查好，SSR 直接显示数字，避免客户端 mount 后才补上。
 */
export function UserMenu({
  user,
  initialUnread = 0,
}: {
  user: SessionUser | null;
  initialUnread?: number;
}) {
  const t = useT();
  const [unread, setUnread] = useState(initialUnread);

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ unreadCount: number }>("/api/notifications");
      setUnread(res.unreadCount ?? 0);
    } catch {
      /* 401 等忽略 */
    }
  }, [user]);

  useEffect(() => {
    void fetchUnread();
    if (!user) return;
    const id = setInterval(() => void fetchUnread(), 30_000);
    const onChanged = () => void fetchUnread();
    window.addEventListener("notifications:changed", onChanged);
    return () => {
      clearInterval(id);
      window.removeEventListener("notifications:changed", onChanged);
    };
  }, [user, fetchUnread]);

  const href = user ? "/account" : "/auth/login";
  // 跟 CartBadge 一致：文字 + 括号数字（0 时不显示括号，避免空 `Account ()`）
  const label = user && unread > 0
    ? `${t("Account")} (${unread > 99 ? "99+" : unread})`
    : t("Account");
  const finalLabel = user ? label : t("Login");

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="h-auto gap-2 p-0 text-xs font-normal text-current opacity-65 hover:bg-transparent hover:opacity-100 [&_svg]:size-6"
    >
      <Link href={href} className="inline-flex items-center gap-2">
        {/* 700–999px 只显示图标，≥1000px 只显示文字（见 globals.css 顶栏三段式） */}
        <UserCircle className="header-account-icon h-6 w-6" />
        <span className="header-account-text">{finalLabel}</span>
      </Link>
    </Button>
  );
}
