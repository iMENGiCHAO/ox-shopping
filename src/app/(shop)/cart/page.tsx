"use client";

import Link from "next/link";
import { toast } from "sonner";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/components/shop/currency-provider";
import { useCart } from "@/components/shop/cart-provider";
import { QuantityInput } from "@/components/shop/quantity-input";
import { formatSpecs } from "@/components/shop/types";
import { useT } from "@/components/shop/lang-provider";

/**
 * /cart — shop.x.com 官方同构（1440px 实测）：
 * - 空态：H1 "Cart" 18px 居中(y379) + "Your cart is empty" + 实心黑 Continue shopping(175×46)
 * - 填充态：H1 "Cart" 28px 居中(y129) → 表头 Product|Quantity|Total(12px,y216) →
 *   行(120px 方图 + 标题/Sale price/变体 + 居中数量步进器 + 右对齐行小计) →
 *   右对齐 "Total: $X USD"(17px) + 税费提示(14px 65%) + 实心黑 Checkout(117×46)
 */
export default function CartPage() {
  const { items, subtotal, loading, updateQuantity, removeItem } = useCart();
  const { format } = useCurrency();
  const t = useT();

  const handleremove = async (cartItemId: string) => {
    try {
      await removeItem(cartItemId);
      toast.success(t("Item removed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Could not remove, please try again"));
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-[980px] space-y-6 py-16">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-64 self-end" />
      </div>
    );
  }

  /* ── 空态 ── */
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center pt-[314px] pb-[250px] text-center">
        <h1 className="text-[18px] font-normal leading-snug text-foreground">{t("Cart")}</h1>
        <p className="mt-4 text-[15px] font-normal text-foreground">{t("Your cart is empty")}</p>
        <Link
          href="/products"
          className="mt-7 inline-flex h-[46px] items-center bg-primary px-[26px] text-[14px] font-normal text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t("Continue shopping")}
        </Link>
      </div>
    );
  }

  /* ── 填充态：官方表格布局 ── */
  return (
    <div className="container pb-20">
      <h1 className="pt-16 text-center text-[28px] font-normal leading-tight text-foreground">
        {t("Cart")}
      </h1>

      <div className="mx-auto mt-[52px] max-w-[980px]">
        {/* 表头 — md 以上显示 */}
        <div className="hidden items-center pb-3 md:flex">
          <p className="flex-1 text-[12px] font-normal uppercase-none tracking-wide text-foreground">
            {t("Product")}
          </p>
          <p className="w-[289px] shrink-0 text-center text-[12px] font-normal text-foreground">
            {t("Quantity")}
          </p>
          <p className="w-[130px] shrink-0 text-right text-[12px] font-normal text-foreground">
            {t("Total")}
          </p>
        </div>

        {/* 行 */}
        <ul>
          {items.map((item) => (
            <li
              key={item.id}
              className="border-t border-border py-6 last:border-b md:flex md:items-center md:py-0"
            >
              {/* Product 列 */}
              <div className="flex flex-1 items-start gap-6">
                <Link
                  href={`/products/${item.slug}`}
                  className="relative block h-[120px] w-[120px] shrink-0 overflow-hidden bg-secondary"
                >
                  <ImageWithFallback
                    src={item.image ?? undefined}
                    alt={item.name}
                    fill
                    sizes="120px"
                    className="object-contain"
                  />
                </Link>
                <div className="min-w-0 pt-1">
                  <Link
                    href={`/products/${item.slug}`}
                    className="block text-[15px] font-normal leading-snug text-foreground underline-offset-2 hover:underline md:w-[93px]"
                  >
                    {typeof item.name === "string" ? item.name : JSON.stringify(item.name)}
                  </Link>
                  <p className="mt-1 text-[13px] text-foreground/70">{format(item.price)}</p>
                  {formatSpecs(item.attributes) ? (
                    <p className="mt-1 text-[13px] uppercase text-foreground/70">
                      {/* 官方仅显示变体值（如 WHITE），不带选项名前缀 */}
                      {formatSpecs(item.attributes)
                        .split(" / ")
                        .map((pair) => pair.split("：").pop()?.trim() ?? "")
                        .join(" / ")}
                    </p>
                  ) : null}
                  {/* Remove — 移动端显示在信息下方；桌面端在数量列下 */}
                  <button
                    type="button"
                    onClick={() => void handleremove(item.id)}
                    className="mt-2 text-[13px] text-foreground/70 underline-offset-2 hover:text-foreground hover:underline md:hidden"
                  >
                    {t("Remove")}
                  </button>
                </div>
              </div>

              {/* Quantity 列 */}
              <div className="mt-4 flex items-center justify-between md:mt-0 md:w-[289px] md:shrink-0 md:flex-col md:items-center md:justify-center md:gap-2 md:self-stretch md:py-6">
                <span className="text-[12px] text-foreground/60 md:hidden">{t("Quantity")}</span>
                <div className="flex flex-col items-center gap-1.5">
                  <QuantityInput
                    value={item.quantity}
                    min={1}
                    max={Math.min(99, Math.max(1, item.stock))}
                    onChange={(q) => {
                      void updateQuantity(item.id, q).catch((err: Error) => toast.error(err.message));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleremove(item.id)}
                    className="hidden text-[13px] text-foreground/70 underline-offset-2 hover:text-foreground hover:underline md:inline-block"
                  >
                    {t("Remove")}
                  </button>
                </div>
              </div>

              {/* Total 列 */}
              <div className="mt-3 flex items-center justify-between md:mt-0 md:w-[130px] md:shrink-0 md:justify-end md:self-stretch md:py-6">
                <span className="text-[12px] text-foreground/60 md:hidden">{t("Total")}</span>
                <span className="text-[15px] tabular-nums text-foreground">
                  {format(item.subtotal)}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* 汇总 — 右对齐 */}
        <div className="mt-10 flex flex-col items-end gap-3">
          <p className="text-[17px] font-normal text-foreground">
            {t("Total:")}{" "}
            <span className="tabular-nums">
              {format(subtotal)} {t("USD")}
            </span>
          </p>
          <p className="text-[14px] font-normal text-foreground/65">
            {t("Taxes and shipping calculated at checkout")}
          </p>
          <Link
            href="/checkout"
            className="mt-3 inline-flex h-[46px] items-center justify-center bg-primary px-[30px] text-[14px] font-normal text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("Checkout")}
          </Link>
        </div>
      </div>
    </div>
  );
}
