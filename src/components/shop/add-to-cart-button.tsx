"use client";

import { useState } from "react";
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
  /** 库存上限（大爷需求：游客加购即时校验，不足当场 toast，不等结账） */
  stock?: number;
  /** 预售商品允许 0 库存下单，跳过库存校验 */
  isPresale?: boolean;
}

/** Add to bag button — signed-in hits server; guests use localStorage.
 * 售罄(disabled)时按官方样式渲染为不可点的 "Sold out"。
 *
 * **纯文字按钮**：原站 PDP 的 `Add To Cart` 不带任何图标（截图实测），
 * 此前本地在文字前渲染了 lucide 的购物车图标 —— 属 A2 级样式偏差，已移除。 */
export function AddToCartButton({
  productId,
  quantity = 1,
  attributes,
  disabled,
  className,
  stock,
  isPresale,
}: AddToCartButtonProps) {
  const { addToCart } = useCart();
  const [pending, setPending] = useState(false);
  const t = useT();

  const handleClick = async () => {
    setPending(true);
    try {
      await addToCart(productId, quantity, attributes, { stock, isPresale });
      window.dispatchEvent(new CustomEvent("cart:open"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Could not add to bag, please try again"));
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
      {pending ? t("Adding…") : t("Add To Cart")}
    </Button>
  );
}
