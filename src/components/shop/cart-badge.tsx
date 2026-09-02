"use client";

import { useCart } from "@/components/shop/cart-provider";
import { cn } from "@/lib/utils";
import { useT } from "@/components/shop/lang-provider";
import { ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Cart link — shop.x.com style: plain text "Cart (n)", faded on black,
 * opens the slide-in drawer.
 */
export function CartBadge({ className }: { className?: string }) {
  const { count, loading } = useCart();
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
      {/* 移动端购物车图标（官方 22×22）+ 数量角标 */}
      <span className="header-cart-icon relative">
        <ShoppingBag className="h-6 w-6" strokeWidth={1.5} />
        {!loading && count > 0 ? (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-medium leading-none text-ink">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      {/* 桌面端文字（官方 desktop: Cart (n)） */}
      <span className="header-cart-text">
        {loading ? t("Cart") : `${t("Cart")} (${count > 99 ? "99+" : count})`}
      </span>
    </button>
  );
}
