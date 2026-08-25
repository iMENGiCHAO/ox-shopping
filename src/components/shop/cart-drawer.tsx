"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { useCart } from "@/components/shop/cart-provider";
import { useCurrency } from "@/components/shop/currency-provider";
import { QuantityInput } from "@/components/shop/quantity-input";
import { toast } from "sonner";
import { formatSpecs } from "@/components/shop/types";

import { useShopLang } from "@/components/shop/lang-provider";
/** Cart drawer — slides in from the right after add-to-bag */
export function CartDrawer() {
  const { t } = useShopLang();

  const { items, count, subtotal, loading, updateQuantity, removeItem } = useCart();
  const { format } = useCurrency();
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("cart:open", onOpen);
    return () => window.removeEventListener("cart:open", onOpen);
  }, []);

  useEffect(() => {
    if (open) {
      setRendered(true);
      document.body.style.overflow = "hidden";
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("keydown", onKey);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", onKey);
      };
    }
    const t = setTimeout(() => setRendered(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("Shopping bag")}>
      {/* backdrop */}
      <div
        className={`absolute inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />
      {/* panel */}
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-card shadow-soft-lg transition-transform duration-300 ease-out motion-reduce:transition-none ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-normal text-foreground">Your Bag ({count})</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("Close bag")}
            className="p-1.5 opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* items */}
        <div className="flex-1 overflow-y-auto px-5">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-base font-medium text-foreground">Your bag is empty</p>
              <p className="text-sm text-muted-foreground">Discover something you&rsquo;ll love.</p>
              <Button asChild className="mt-6" onClick={() => setOpen(false)}>
                <Link href="/products">Start Shopping</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="flex gap-4 py-5">
                  <Link
                    href={`/products/${item.slug}`}
                    className="relative h-20 w-20 shrink-0 overflow-hidden border border-border"
                    onClick={() => setOpen(false)}
                  >
                    <ImageWithFallback
                      src={item.image ?? undefined}
                      alt={item.name}
                      fill
                      sizes="80px"
                      className="object-contain"
                    />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/products/${item.slug}`}
                        onClick={() => setOpen(false)}
                        className="line-clamp-2 text-[13px] font-normal text-foreground hover:underline"
                      >
                        {item.name}
                      </Link>
                      <button
                        type="button"
                        aria-label="remove item"
                        onClick={() =>
                          void removeItem(item.id).catch((e: Error) => toast.error(e.message))
                        }
                        className="shrink-0 p-1 opacity-50 transition-opacity hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {formatSpecs(item.attributes) ? (
                      <p className="mt-1 text-xs opacity-60">
                        {formatSpecs(item.attributes)}
                      </p>
                    ) : null}
                    <div className="mt-auto flex items-end justify-between pt-2">
                      <QuantityInput
                        value={item.quantity}
                        min={1}
                        max={Math.min(99, Math.max(1, item.stock))}
                        onChange={(q) => {
                          void updateQuantity(item.id, q).catch((e: Error) =>
                            toast.error(e.message),
                          );
                        }}
                      />
                      <span className="text-[15px] text-foreground">
                        {format(item.subtotal)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* footer */}
        {items.length > 0 ? (
          <div className="space-y-3 border-t border-border px-5 py-5">
            <div className="flex items-center justify-between">
              <span className="text-sm opacity-60">Subtotal</span>
              <span className="text-lg font-normal text-foreground">{format(subtotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Shipping & taxes calculated at checkout.
            </p>
            <Button asChild size="lg" className="w-full" onClick={() => setOpen(false)}>
              <Link href="/checkout">Checkout</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              <Link href="/cart">View Full Bag</Link>
            </Button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
