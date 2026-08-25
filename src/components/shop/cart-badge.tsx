"use client";

import { useCart } from "@/components/shop/cart-provider";
import { cn } from "@/lib/utils";
import { useT } from "@/components/shop/lang-provider";

/**
 * Cart link — shop.x.com style: plain text "Cart (n)", faded on black,
 * opens the slide-in drawer.
 */
export function CartBadge({ className }: { className?: string }) {
  const { count, loading } = useCart();
  const t = useT();

  return (
    <button
      type="button"
      aria-label={t("Bag, {n} items", { n: count })}
      onClick={() => window.dispatchEvent(new CustomEvent("cart:open"))}
      className={cn(
        "inline-flex items-center gap-1 text-sm opacity-65 transition-opacity hover:opacity-100",
        className,
      )}
    >
      {loading ? t("Cart") : `${t("Cart")} (${count > 99 ? "99+" : count})`}
    </button>
  );
}
