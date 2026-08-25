"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useCart } from "@/components/shop/cart-provider";
import { toast } from "sonner";

import { useShopLang } from "@/components/shop/lang-provider";
/** Quick-add pill — appears at bottom-right of a product card on hover */
export function QuickAddButton({ productId, disabled }: { productId: string; disabled?: boolean }) {
  const { t } = useShopLang();

  const { addToCart } = useCart();
  const [pending, setPending] = useState(false);

  const handle = async () => {
    if (pending || disabled) return;
    setPending(true);
    try {
      await addToCart(productId, 1);
      toast.success(t("Added to bag"));
      window.dispatchEvent(new CustomEvent("cart:open"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add to bag, please try again");
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      aria-label="Quick add to bag"
      disabled={disabled || pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void handle();
      }}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-background text-foreground transition-[background-color,color,transform] duration-200 hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-40 [&:hover_svg]:rotate-90 [&_svg]:transition-transform [&_svg]:duration-300"
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}
