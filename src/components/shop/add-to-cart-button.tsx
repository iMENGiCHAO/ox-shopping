"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/shop/cart-provider";
import { toast } from "sonner";
import type { SpecSelection } from "@/components/shop/types";
import { useT } from "@/components/shop/lang-provider";

export interface AddToCartButtonProps {
  productId: string;
  quantity?: number;
  attributes?: SpecSelection[];
  disabled?: boolean;
  className?: string;
}

/** Add to bag button — signed-in hits server; guests use localStorage.
 * 售罄(disabled)时按官方样式渲染为不可点的 "Sold out"。 */
export function AddToCartButton({
  productId,
  quantity = 1,
  attributes,
  disabled,
  className,
}: AddToCartButtonProps) {
  const { addToCart } = useCart();
  const [pending, setPending] = useState(false);
  const t = useT();

  const handleClick = async () => {
    setPending(true);
    try {
      await addToCart(productId, quantity, attributes);
      window.dispatchEvent(new CustomEvent("cart:open"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Could not add to bag, please try again"),
      );
    } finally {
      setPending(false);
    }
  };

  if (disabled) {
    // 官方售罄：浅灰底、无 hover 变化、不可点击
    return (
      <Button
        type="button"
        disabled
        aria-disabled="true"
        className={className}
        data-sold-out="true"
      >
        {t("Sold out")}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      onClick={() => void handleClick()}
      disabled={pending}
      className={className}
    >
      <ShoppingCart className="mr-1.5 h-4 w-4" />
      {pending ? t("Adding…") : t("Add To Cart")}
    </Button>
  );
}
