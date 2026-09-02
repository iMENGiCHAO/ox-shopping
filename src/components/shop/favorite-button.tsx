"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/components/shop/favorites-provider";
import { useT } from "@/components/shop/lang-provider";

/**
 * 收藏心形按钮：商品卡内使用 span[role=button]（避免 <a> 内嵌 <button> 的非法嵌套），
 * 点击阻止冒泡/默认行为，仅切换收藏。variant=overlay 用于图片上（白描边），plain 用于白底（PDP）。
 */
export function FavoriteButton({
  productId,
  variant = "overlay",
  className,
}: {
  productId: string;
  variant?: "overlay" | "plain";
  className?: string;
}) {
  const { isFavorited, toggle } = useFavorites();
  const t = useT();
  const active = isFavorited(productId);

  const onActivate = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
    void toggle(productId);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={active ? t("Remove from favorites") : t("Add to favorites")}
      aria-pressed={active}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onActivate(e);
      }}
      className={cn(
        "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
        variant === "overlay"
          ? "border border-white/40 bg-black/25 text-white hover:border-white hover:bg-white/15"
          : "border border-black/10 bg-white text-foreground hover:bg-muted",
        className,
      )}
    >
      <Heart className={cn("h-[18px] w-[18px]", active && "fill-current")} strokeWidth={1.5} />
    </span>
  );
}
