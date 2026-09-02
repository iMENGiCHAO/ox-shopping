"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Truck } from "lucide-react";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/components/shop/currency-provider";
import { useCart } from "@/components/shop/cart-provider";
import { QuantityInput } from "@/components/shop/quantity-input";
import { formatSpecs } from "@/components/shop/types";
import { useT, useShopLang } from "@/components/shop/lang-provider";
import { apiFetch } from "@/lib/fetch-client";

interface ShippingMethodLite {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  fee: number;
  freeOver: number;
  isCashOnDelivery: boolean;
  etaZh: string | null;
  etaEn: string | null;
}

/**
 * /cart — shop.x.com 官方同构（1440px 实测）：
 * - 空态：H1 "Cart" 18px 居中(y379) + "Your cart is empty" + 实心黑 Continue shopping(175×46)
 * - 填充态：H1 "Cart" 28px 居中(y129) → 表头 Product|Quantity|Total(12px,y216) →
 *   行(120px 方图 + 标题/Sale price/变体 + 居中数量步进器 + 右对齐行小计) →
 *   右对齐 "Total: $X USD"(17px) + 税费提示(14px 65%) + 实心黑 Checkout(117×46)
 */
export default function CartPage() {
  const { items, subtotal, loading, updateQuantity, removeItem } = useCart();
  const { format, code } = useCurrency();
  const t = useT();
  const { lang } = useShopLang();
  const [methods, setMethods] = useState<ShippingMethodLite[]>([]);
  const [selectedMethodCode, setSelectedMethodCode] = useState<string>("");

  // 拉可用物流方式
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<{ methods: ShippingMethodLite[] }>(
          "/api/shipping-methods",
        );
        if (cancelled) return;
        const list = res.methods ?? [];
        setMethods(list);
        if (list.length > 0) {
          setSelectedMethodCode(list[0]!.code);
        }
      } catch {
        // 静默失败，不影响结账
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedMethod = methods.find((m) => m.code === selectedMethodCode) ?? null;
  const isCOD = selectedMethod?.isCashOnDelivery ?? false;
  const freeOver = selectedMethod?.freeOver ?? 0;
  const freeShipping = !isCOD && freeOver > 0 && subtotal >= freeOver;
  const shippingFee = isCOD || freeShipping ? 0 : (selectedMethod?.fee ?? 0);
  const toFreeShipping = freeOver > 0 && subtotal < freeOver ? freeOver - subtotal : 0;
  const hasOutOfStock = items.some((it) => it.stock <= 0);
  const hasPresale = items.some((it) => it.isPresale);

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
      <div className="flex flex-col items-center pb-[250px] pt-[314px] text-center">
        <h1 className="text-[18px] font-normal text-foreground" style={{ lineHeight: 1.6 }}>
          {t("Cart")}
        </h1>
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
          <p className="uppercase-none flex-1 text-[12px] font-normal tracking-wide text-foreground">
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
                  {/* 库存 / 预购 状态徽章 */}
                  {item.stock <= 0 && !item.isPresale ? (
                    <p className="mt-1 inline-block rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                      {lang === "zh" ? "缺货" : "Out of stock"}
                    </p>
                  ) : item.isPresale ? (
                    <p className="mt-1 inline-block rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                      {lang === "zh" ? "预售" : "Pre-order"}
                    </p>
                  ) : null}
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
                      void updateQuantity(item.id, q).catch((err: Error) =>
                        toast.error(err.message),
                      );
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

        {/* 库存/预购警示（购物车栏里已标） */}
        {hasOutOfStock ? (
          <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/[0.06] p-3 text-sm text-foreground">
            <p className="font-medium text-destructive">
              {lang === "zh"
                ? "⚠️ 购物车中有缺货商品，请删除后再结账"
                : "⚠️ Some items are out of stock. Please remove them before checkout."}
            </p>
          </div>
        ) : null}
        {hasPresale ? (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/[0.06] p-3 text-sm text-foreground">
            <p className="text-warning-foreground">
              {lang === "zh"
                ? "🕐 购物车中有预售商品，发货时间会延后到货时再发出"
                : "🕐 Your cart contains pre-order items. They will ship once back in stock."}
            </p>
          </div>
        ) : null}

        {/* 物流方式 + 凑单 + 运费预览 */}
        {methods.length > 0 ? (
          <div className="mt-8 flex flex-col items-end gap-2 border-t pt-6">
            <p className="flex items-center gap-2 text-[12px] text-foreground/70">
              <Truck className="h-3.5 w-3.5" />
              {lang === "zh" ? "预计运费" : "Estimated shipping"}：
            </p>
            <select
              value={selectedMethodCode}
              onChange={(e) => setSelectedMethodCode(e.target.value)}
              className="h-8 rounded border border-border bg-card px-2 text-sm"
            >
              {methods.map((m) => {
                const label = lang === "zh" ? m.name : (m.nameEn ?? m.name);
                const eta = lang === "zh" ? m.etaZh : m.etaEn;
                return (
                  <option key={m.id} value={m.code}>
                    {label}
                    {eta ? `（${eta}）` : ""}
                    {m.isCashOnDelivery ? " · 货到付款" : ""}
                  </option>
                );
              })}
            </select>
            <p className="text-[13px] text-foreground/70">
              {isCOD ? (
                <span className="text-warning">
                  {lang === "zh"
                    ? `货到付款，到付 ${format(selectedMethod?.fee ?? 0)}`
                    : `Pay on delivery: ${format(selectedMethod?.fee ?? 0)}`}
                </span>
              ) : freeShipping ? (
                <span className="text-success">
                  {lang === "zh" ? "已享免邮" : "Free shipping unlocked"}
                </span>
              ) : shippingFee > 0 ? (
                <>
                  {format(shippingFee)}{" "}
                  <span className="text-foreground/50">
                    ({lang === "zh" ? "订单确认时计算" : "calculated at checkout"})
                  </span>
                </>
              ) : null}
            </p>
            {toFreeShipping > 0 ? (
              <p className="text-[12px] text-foreground/65">
                {lang === "zh" ? (
                  <>
                    再凑 <span className="font-bold text-primary">{format(toFreeShipping)}</span>{" "}
                    即可享免邮
                  </>
                ) : (
                  <>
                    Spend <span className="font-bold text-primary">{format(toFreeShipping)}</span>{" "}
                    more for free shipping
                  </>
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 汇总 — 右对齐 */}
        <div className="mt-8 flex flex-col items-end gap-3 border-t pt-6">
          <p className="text-[17px] font-normal text-foreground">
            {t("Total:")}{" "}
            <span className="tabular-nums">
              {format(subtotal)} {code}
            </span>
          </p>
          <p className="text-[14px] font-normal text-foreground/65">
            {t("Taxes and shipping calculated at checkout")}
          </p>
          <Link
            href="/checkout"
            className="mt-3 inline-flex h-[46px] items-center justify-center bg-primary px-[30px] text-[14px] font-normal text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-disabled={hasOutOfStock}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
              if (hasOutOfStock) {
                e.preventDefault();
                toast.error(
                  lang === "zh"
                    ? "请先删除缺货商品"
                    : "Please remove out-of-stock items first",
                );
              }
            }}
          >
            {t("Checkout")}
          </Link>
        </div>
      </div>
    </div>
  );
}
