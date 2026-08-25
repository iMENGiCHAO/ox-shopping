"use client";

/**
 * 结算流程(客户端)：
 * - 未登录 → 跳转登录页(带回跳)
 * - buyNow 模式：通过 /api/cart/preview 获取单件商品独立成单
 * - 普通模式：读取服务端Shopping Bag /api/cart
 * - 步骤：收货地址 → 配送方式 → Discount券 → 备注 → 订单摘要 → 提交
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, MapPin, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/fetch-client";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from "@/lib/constants";
import { useCurrency } from "@/components/shop/currency-provider";
import { toast } from "sonner";
import { AddressForm } from "@/components/shop/address-form";
import { formatSpecs, type ShopAddress } from "@/components/shop/types";
import { useT } from "@/components/shop/lang-provider";

interface CartLineLite {
  id: string;
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  price: number;
  stock: number;
  status: string;
  quantity: number;
  subtotal: number;
  attributes?: { name: string; value: string }[];
}

interface PreviewProduct {
  id: string;
  name: string;
  slug: string;
  images: string[] | null;
  price: number | string;
  stock: number;
  status: string;
}

interface AppliedCoupon {
  code: string;
  discount: number;
  freeShipping: boolean;
}

export interface CheckoutFlowProps {
  buyNow?: string;
  quantity?: string;
  /** 立即购买携带的下单规格(JSON 字符串) */
  attrs?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function CheckoutFlow({ buyNow, quantity, attrs }: CheckoutFlowProps) {
  const { format } = useCurrency();
  const t = useT();
  const [phase, setPhase] = useState<"loading" | "ready" | "empty">("loading");
  const [lines, setLines] = useState<CartLineLite[]>([]);
  const [addresses, setAddresses] = useState<ShopAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [shippingMethod, setShippingMethod] = useState<"standard" | "express">("standard");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [couponApplying, setCouponApplying] = useState(false);

  /** 初始化：登录校验 + 地址 + Shopping Bag/买一件商品 */
  useEffect(() => {
    let cancelled = false;

    const loadCart = async () => {
      const cart = await apiFetch<{ items: CartLineLite[]; count: number; subtotal: number }>(
        "/api/cart",
      );
      setLines(cart.items ?? []);
    };

    (async () => {
      try {
        await apiFetch<{ user: { id: string } }>("/api/auth/me");
      } catch {
        // 未登录 → 跳登录页并回跳
        window.location.href = `/auth/login?next=${encodeURIComponent(
          window.location.pathname + window.location.search,
        )}`;
        return;
      }

      try {
        const addrPromise = apiFetch<{ addresses: ShopAddress[] }>("/api/user/addresses");
        if (buyNow) {
          const data = await apiFetch<{ products: PreviewProduct[] }>(
            `/api/cart/preview?ids=${encodeURIComponent(buyNow)}`,
          );
          if (cancelled) return;
          const product = data.products?.[0];
          if (!product) {
            setPhase("empty");
            return;
          }
          const qty = Math.min(Math.max(1, Number(quantity) || 1), 99);
          const price = Number(product.price) || 0;
          let attributes: { name: string; value: string }[] | undefined;
          try {
            const parsed = attrs ? (JSON.parse(attrs) as unknown) : null;
            if (Array.isArray(parsed)) {
              attributes = parsed.filter(
                (a): a is { name: string; value: string } =>
                  !!a &&
                  typeof a === "object" &&
                  typeof (a as { name?: unknown }).name === "string" &&
                  typeof (a as { value?: unknown }).value === "string",
              );
            }
          } catch {
            attributes = undefined;
          }
          setLines([
            {
              id: product.id,
              productId: product.id,
              name: product.name,
              slug: product.slug,
              image: Array.isArray(product.images) ? (product.images[0] ?? null) : null,
              price,
              stock: product.stock,
              status: product.status,
              quantity: qty,
              subtotal: round2(price * qty),
              attributes,
            },
          ]);
        } else {
          await loadCart();
        }

        const addrRes = await addrPromise;
        const addr = addrRes?.addresses ?? [];
        if (cancelled) return;
        setAddresses(addr);
        const defaultAddr = addr.find((a) => a.isDefault) ?? addr[0] ?? null;
        setSelectedAddressId(defaultAddr ? defaultAddr.id : null);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load checkout data", err);
        setPhase("empty");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buyNow, quantity, attrs]);

  const subtotal = useMemo(() => round2(lines.reduce((s, l) => s + l.subtotal, 0)), [lines]);
  const discount = appliedCoupon?.discount ?? 0;
  const baseShipping = shippingMethod === "express" ? SHIPPING_FEE * 2 : SHIPPING_FEE;
  const freeShipping =
    appliedCoupon?.freeShipping === true || subtotal - discount >= FREE_SHIPPING_THRESHOLD;
  const shippingFee = freeShipping ? 0 : baseShipping;
  const estimatedTotal = round2(subtotal - discount + shippingFee);

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) {
      toast.error(t("Please enter a promo code"));
      return;
    }
    setCouponApplying(true);
    try {
      const res = await apiFetch<{ discount: number; freeShipping: boolean }>(
        "/api/coupons/apply",
        {
          method: "POST",
          body: JSON.stringify({ code, subtotal }),
        },
      );
      setAppliedCoupon({
        code: code.toUpperCase(),
        discount: res.discount,
        freeShipping: res.freeShipping,
      });
      toast.success(t("Promo code applied"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Could not apply promo code"));
    } finally {
      setCouponApplying(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedAddressId) {
      toast.error(t("Please select a shipping address"));
      return;
    }
    if (lines.length === 0) {
      toast.error(t("Your order has no items"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{ orderNumber: string; paymentUrl: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            attributes: l.attributes && l.attributes.length > 0 ? l.attributes : undefined,
          })),
          addressId: selectedAddressId,
          couponCode: appliedCoupon?.code ?? null,
          shippingMethod,
          note: note.trim() || null,
        }),
      });
      if (res?.paymentUrl) {
        window.location.href = res.paymentUrl;
      } else {
        toast.success(t("Order submitted"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to submit your order, please try again later"));
      setSubmitting(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (phase === "empty" || lines.length === 0) {
    return (
      <EmptyState
        icon={<MapPin className="h-5 w-5" />}
        title={t("Checkout unavailable")}
        description={t("Your cart is empty or items failed to load — please go back and continue shopping.")}
        action={
          <Button asChild>
            <a href="/products">{t("Browse Products")}</a>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Shipping Address */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            {t("1. Shipping Address")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No shipping address yet — please add one first.")}</p>
          ) : (
            <RadioGroup value={selectedAddressId ?? undefined} onValueChange={setSelectedAddressId}>
              <div className="space-y-2">
                {addresses.map((addr) => (
                  <Label
                    key={addr.id}
                    htmlFor={`addr-${addr.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary"
                  >
                    <RadioGroupItem value={addr.id} id={`addr-${addr.id}`} className="mt-0.5" />
                    <span className="min-w-0 text-sm">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{addr.recipientName}</span>
                        <span className="text-muted-foreground">{addr.phone}</span>
                        {addr.isDefault ? (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            {t("Default")}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {addr.province} {addr.city} {addr.district} {addr.detail}
                      </span>
                    </span>
                  </Label>
                ))}
              </div>
            </RadioGroup>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddressDialogOpen(true)}
          >
            {t("Add a shipping address")}
          </Button>
        </CardContent>
      </Card>

      {/* 2. Shipping method */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("2. Shipping method")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={shippingMethod}
            onValueChange={(v) => setShippingMethod(v as "standard" | "express")}
          >
            <div className="space-y-2">
              <Label
                htmlFor="ship-standard"
                className="flex cursor-pointer items-center justify-between rounded-lg border p-3 has-[[data-state=checked]]:border-primary"
              >
                <span className="flex items-center gap-3 text-sm">
                  <RadioGroupItem value="standard" id="ship-standard" />
                  {t("Standard shipping (3-5 days)")}
                </span>
                <span className="text-sm font-medium">
                  {freeShipping ? t("Free shipping") : format(SHIPPING_FEE)}
                </span>
              </Label>
              <Label
                htmlFor="ship-express"
                className="flex cursor-pointer items-center justify-between rounded-lg border p-3 has-[[data-state=checked]]:border-primary"
              >
                <span className="flex items-center gap-3 text-sm">
                  <RadioGroupItem value="express" id="ship-express" />
                  {t("Express shipping (1-2 days)")}
                </span>
                <span className="text-sm font-medium">
                  {freeShipping ? t("Free shipping") : format(SHIPPING_FEE * 2)}
                </span>
              </Label>
            </div>
          </RadioGroup>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Spend {threshold} for free shipping (or use a free-shipping coupon)", { threshold: format(FREE_SHIPPING_THRESHOLD) })}
          </p>
        </CardContent>
      </Card>

      {/* 3. DiscountCoupon */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4" />
            {t("3. Coupon (optional)")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {appliedCoupon ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
              <span>
                {t("Applied coupon")} <span className="font-mono font-bold">{appliedCoupon.code}</span>
                {appliedCoupon.freeShipping
                  ? t("(free shipping)")
                  : ` —  ${format(appliedCoupon.discount)}`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAppliedCoupon(null)}
              >
                {t("remove")}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder={t("Enter coupon code, e.g. WELCOME10")}
                className="max-w-xs"
              />
              <Button
                type="button"
                variant="outline"
                disabled={couponApplying}
                onClick={() => void handleApplyCoupon()}
              >
                {couponApplying ? t("Applying…") : t("Apply")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Order notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("4. Order notes (optional)")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("Delivery time requests, invoice details, etc. (max 300 chars)")}
            rows={3}
            maxLength={300}
          />
        </CardContent>
      </Card>

      {/* 5. Order summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("5. Order summary")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 text-sm">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden border">
                  <ImageWithFallback
                    src={line.image ?? undefined}
                    alt={line.name}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>
                <span className="flex-1">
                  <span className="block line-clamp-1">{line.name}</span>
                  {formatSpecs(line.attributes) ? (
                    <span className="block text-xs text-muted-foreground">
                      {formatSpecs(line.attributes)}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground">× {line.quantity}</span>
                <span className="w-24 text-right font-medium">{format(line.subtotal)}</span>
              </li>
            ))}
          </ul>
          <Separator />
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Subtotal")}</dt>
              <dd>{format(subtotal)}</dd>
            </div>
            {discount > 0 ? (
              <div className="flex justify-between text-success">
                <dt>{t("Discount")}</dt>
                <dd>-{format(discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Shipping")}</dt>
              <dd>
                {freeShipping ? (
                  <span className="text-success">{t("Free shipping")}</span>
                ) : (
                  format(shippingFee)
                )}
              </dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-bold">
              <dt>{t("Estimated total")}</dt>
              <dd className="text-xl font-normal text-foreground">
                {format(estimatedTotal)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button asChild variant="ghost">
          <a href="/cart">
            {t("Back to cart")}
            <ChevronRight className="ml-1 h-4 w-4" />
          </a>
        </Button>
        <Button size="lg" disabled={submitting} onClick={() => void handleSubmit()}>
          {submitting ? t("Submitting…") : t("Place order · {total}", { total: format(estimatedTotal) })}
        </Button>
      </div>

      <AddressForm
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        onSaved={() => {
          // 重新拉取地址并选中新地址
          apiFetch<{ addresses: ShopAddress[] }>("/api/user/addresses")
            .then((res) => {
              const list = res?.addresses ?? [];
              setAddresses(list);
              const created = list[0];
              if (created) setSelectedAddressId(created.id);
            })
            .catch(() => toast.error(t("Failed to refresh the address list")));
        }}
      />
    </div>
  );
}
