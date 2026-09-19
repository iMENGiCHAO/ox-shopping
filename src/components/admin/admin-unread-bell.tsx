"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/fetch-client";

/**
 * 顶栏提醒 Bell — 消息中心入口（客户端组件）
 * 角标 = 站内通知未读数 + 未读订单数 + 待退款数；每 30s 拉一次。
 *
 * 注意：消息中心接口是 ADMIN 专属（requireAdmin），SUPPORT 调用会 403。
 * 因此用 allSettled 分别容错——SUPPORT 仍能正常看到订单/退款角标，
 * 而不是因一个 403 导致整个 Promise.all 抛错、角标恒为 0。
 */
export function AdminUnreadBell({ isAdmin = true }: { isAdmin?: boolean }) {
  const [unread, setUnread] = React.useState<{
    messages: number;
    orders: number;
    refunds: number;
  } | null>(null);

  React.useEffect(() => {
    let active = true;
    const fetchCount = async () => {
      const [msg, o] = await Promise.allSettled([
        apiFetch<{ unreadCount: number }>("/api/admin/notifications"),
        apiFetch<{ unreadOrders: number; pendingRefunds: number }>("/api/admin/orders/unread"),
      ]);
      if (!active) return;
      setUnread({
        messages: msg.status === "fulfilled" ? (msg.value.unreadCount ?? 0) : 0,
        orders: o.status === "fulfilled" ? (o.value.unreadOrders ?? 0) : 0,
        refunds: o.status === "fulfilled" ? (o.value.pendingRefunds ?? 0) : 0,
      });
    };
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const total = (unread?.messages ?? 0) + (unread?.orders ?? 0) + (unread?.refunds ?? 0);

  return (
    <Link
      href={isAdmin ? "/admin/notifications" : "/admin/orders"}
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
