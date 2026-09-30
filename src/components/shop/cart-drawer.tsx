"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, X, User, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { useCart } from "@/components/shop/cart-provider";
import { useCurrency } from "@/components/shop/currency-provider";
import { QuantityInput } from "@/components/shop/quantity-input";
import { toast } from "sonner";
import { formatSpecValues } from "@/components/shop/types";
import { LOGGED_IN_COOKIE } from "@/lib/constants";
import { MAX_PRESALE_QTY } from "@/lib/inventory";

import { useShopLang } from "@/components/shop/lang-provider";

/** 检测用户是否已登录（客户端：读服务端写入的 JS 可读提示 cookie） */
function useIsLoggedIn() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    const check = () => {
      // access_token 是 httpOnly，JS 读不到；改用服务端登录时写入的 logged_in 提示 cookie
      setLoggedIn(
        document.cookie.split(";").some((c) => c.trim().startsWith(`${LOGGED_IN_COOKIE}=`)),
      );
    };
    check();
    // 监听登录/登出事件
    window.addEventListener("auth:changed", check);
    return () => window.removeEventListener("auth:changed", check);
  }, []);
  return loggedIn;
}

/** Cart drawer — slides in from the right after add-to-bag */
export function CartDrawer() {
  const { t } = useShopLang();
  const isLoggedIn = useIsLoggedIn();

  const { items, count, subtotal, loading, updateQuantity, removeItem } = useCart();
  const { format } = useCurrency();
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  // 缺货闸门口径（P2-8 商用审计，与 /cart 页一致）：非预售且库存为 0 才阻断结账
  const hasOutOfStock = items.some((it) => it.stock <= 0 && !it.isPresale);

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
          <h2 className="text-base font-normal text-foreground">{t("Your Bag")} ({count})</h2>
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
            <p className="py-16 text-center text-sm text-muted-foreground">{t("Loading…")}</p>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-base font-medium text-foreground">{t("Your bag is empty")}</p>
              <p className="text-sm text-muted-foreground">{t("Discover something you'll love.")}</p>
              <Button asChild className="mt-6" onClick={() => setOpen(false)}>
                <Link href="/collections/all">{t("Start Shopping")}</Link>
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
                    {formatSpecValues(item.attributes) ? (
                      <p className="mt-1 text-xs opacity-60">
                        {formatSpecValues(item.attributes)}
                      </p>
                    ) : null}
                    <div className="mt-auto flex items-end justify-between pt-2">
                      <QuantityInput
                        value={item.quantity}
                        min={1}
                        max={
                          item.isPresale
                            ? MAX_PRESALE_QTY
                            : Math.min(99, Math.max(1, item.stock))
                        }
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
              <span className="text-sm opacity-60">{t("Subtotal")}</span>
              <span className="text-lg font-normal text-foreground">{format(subtotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Shipping & taxes calculated at checkout.")}
            </p>
            {/* 缺货闸门（P2-8 商用审计）：有「非预售且库存为 0」的行时直达结账，
                填完表单提交才被服务端拒绝 —— 与 /cart 页同口径：
                结账按钮切到「查看购物袋」让顾客先处理缺货行。 */}
            {hasOutOfStock ? (
              <Button asChild size="lg" variant="outline" className="w-full" onClick={() => setOpen(false)}>
                <Link href="/cart">{t("Some items are out of stock. Please remove them before checkout.")}</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="w-full" onClick={() => setOpen(false)}>
                <Link href="/checkout">{t("Checkout")}</Link>
              </Button>
            )}
            <Button
              asChild
              variant="ghost"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              <Link href="/cart">{t("View Full Bag")}</Link>
            </Button>
          </div>
        ) : null}

        {/* 数据打通：账户中心入口（头部对齐 上游参考站 无 UserMenu，在此提供账户/通知访问）
            仅登录用户显示，消除"有账户页面但无入口"的信息孤岛 */}
        {isLoggedIn ? (
          <div className="border-t border-border px-5 py-3">
            <div className="flex items-center justify-around">
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <User className="h-3.5 w-3.5" />
                {t("My Account")}
              </Link>
              <Link
                href="/account/notifications"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Bell className="h-3.5 w-3.5" />
                {t("Notifications")}
              </Link>
              <Link
                href="/orders"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("My Orders")}
              </Link>
            </div>
          </div>
        ) : (
          /* 未登录用户：提供登录入口（结账时也会触发登录） */
          <div className="border-t border-border px-5 py-3">
            <Link
              href="/auth/login"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("Sign in to track orders and save your bag")}
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
