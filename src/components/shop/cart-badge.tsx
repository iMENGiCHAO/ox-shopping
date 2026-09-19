"use client";

import { useCart } from "@/components/shop/cart-provider";
import { useNotifications } from "@/components/shop/use-notifications";
import { cn } from "@/lib/utils";
import { useT } from "@/components/shop/lang-provider";
import { ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Cart link — shop.x.com style: plain text "Cart (n)", faded on black,
 * opens the slide-in drawer.
 *
 * 数据打通：有未读通知时在购物车图标右上角显示红点（头部无 UserMenu，
 * 通过购物车图标提示用户有新消息，消除"admin 发通知用户看不到"的信息孤岛）。
 */
export function CartBadge({ className }: { className?: string }) {
  const { count, loading } = useCart();
  const { hasUnread } = useNotifications();
  const t = useT();
  const router = useRouter();

  /** 小屏（<640px）点购物车直接跳 /cart 页面；大屏展开右侧抽屉（官方行为） */
  const handleClick = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      router.push("/cart");
    } else {
      window.dispatchEvent(new CustomEvent("cart:open"));
    }
  };

  return (
    <button
      type="button"
      aria-label={t("Bag, {n} items", { n: count })}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center text-xs opacity-65 transition-opacity hover:opacity-100",
        className,
      )}
    >
      {/* 移动端购物车图标（官方 22×22）+ 数量角标 + 通知红点 */}
      <span className="header-cart-icon relative">
        <ShoppingBag className="h-6 w-6" strokeWidth={1.5} />
        {!loading && count > 0 ? (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-medium leading-none text-ink">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
        {/* 数据打通：未读通知红点（购物车数量角标不存在时显示在右上角） */}
        {hasUnread && (!count || loading) ? (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-ink" aria-label={t("You have unread notifications")} />
        ) : null}
        {/* 有购物车商品且有未读通知时，红点显示在数量角标旁边 */}
        {hasUnread && count > 0 && !loading ? (
          <span className="absolute -right-3 -top-2.5 h-1.5 w-1.5 rounded-full bg-red-500" aria-label={t("You have unread notifications")} />
        ) : null}
      </span>
      {/* 桌面端文字（官方 desktop: Cart (n)） */}
      <span className="header-cart-text">
        {loading ? t("Cart") : `${t("Cart")} (${count > 99 ? "99+" : count})`}
      </span>
    </button>
  );
}
