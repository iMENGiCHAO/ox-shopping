"use client";

/**
 * 结算流程(客户端)：
 * - 未登录 → 跳转登录页(带回跳)
 * - buyNow 模式：通过 /api/cart/preview 获取单件商品独立成单
 * - 普通模式：读取服务端Shopping Bag /api/cart
 * - 步骤：收货地址 → 配送方式(来自DB ShippingMethod) → Discount券 → 备注 → 订单摘要 → 提交
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, MapPin, Ticket, Truck } from "lucide-react";
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
import { useCurrency } from "@/components/shop/currency-provider";
import { toast } from "sonner";
import { AddressForm } from "@/components/shop/address-form";
import { formatSpecs, type ShopAddress } from "@/components/shop/types";
import { useT, useShopLang } from "@/components/shop/lang-provider";

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
  isPresale?: boolean;
}

interface PreviewProduct {
  id: string;
  name: string;
  slug: string;
  images: string[] | null;
  price: number | string;
  stock: number;
  status: string;
  isPresale?: boolean;
}

interface AppliedCoupon {
  code: string;
  discount: number;
  freeShipping: boolean;
}

interface ShippingMethodLite {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  fee: number;
  freeOver: number;
  isCashOnDelivery: boolean;
  etaZh: string | null;
  etaEn: string | null;
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
  const { lang } = useShopLang();
  const [phase, setPhase] = React.useState<"loading" | "ready" | "empty">("loading");
  const [lines, setLines] = useState<CartLineLite[]>([]);
  const [addresses, setAddresses] = useState<ShopAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodLite[]>([]);
  const [shippingMethod, setShippingMethod] = useState<string>("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [note, setNote] = useState("");
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [couponApplying, setCouponApplying] = useState(false);

  const loadCart = useCallback(async () => {
    const res = await apiFetch<{
      items: (CartLineLite & { image: string | null; name: string })[];
    }>("/api/cart");
    setLines(
      (res.items ?? []).map((it) => ({
        id: it.id,
        productId: it.productId,
        name: it.name,
        slug: (it as { slug?: string }).slug ?? "",
        image: it.image ?? null,
        price: (it as { price: number }).price,
        stock: (it as { stock: number }).stock,
        status: (it as { status: string }).status,
        quantity: it.quantity,
        subtotal: it.subtotal,
        attributes: it.attributes,
        isPresale: (it as { isPresale?: boolean }).isPresale,
      })),
    );
  }, []);

  // 拉数据：地址 + 物流方式
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 拉取可用物流方式（DB）
        const shipRes = await apiFetch<{ methods: ShippingMethodLite[] }>("/api/shipping-methods");
        if (cancelled) return;
        const methods = shipRes.methods ?? [];
        setShippingMethods(methods);
        // 默认选中第一个
        if (methods.length > 0 && !shippingMethod) {
          setShippingMethod(methods[0]!.code);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("Failed to load shipping methods", err);
      }

      try {
        // 拉取购物车或 buyNow 单品
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
              isPresale: product.isPresale,
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
        if (err instanceof Error && /401|unauthorized/i.test(err.message)) {
          window.location.href = `/auth/login?next=${encodeURIComponent(
            window.location.pathname + window.location.search,
          )}`;
          return;
        }
        console.warn("Failed to load checkout data", err);
        setPhase("empty");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyNow, quantity, attrs]);

  const subtotal = useMemo(() => round2(lines.reduce((s, l) => s + l.subtotal, 0)), [lines]);
  const discount = appliedCoupon?.discount ?? 0;
  const currentMethod = shippingMethods.find((m) => m.code === shippingMethod);

  // 货到付款运费不计入订单总额（发货时收）
  const baseShipping = currentMethod?.isCashOnDelivery ? 0 : currentMethod?.fee ?? 0;
  // 免邮门槛按当前物流方式的 freeOver 字段（0 = 永不免邮）
  const freeOver = currentMethod?.freeOver ?? 0;
  const freeShipping =
    appliedCoupon?.freeShipping === true || (freeOver > 0 && subtotal - discount >= freeOver);
  const shippingFee = freeShipping ? 0 : baseShipping;
  const estimatedTotal = round2(subtotal - discount + shippingFee);
  // 凑单免邮：还差多少钱
  const toFreeShipping = freeOver > 0 && subtotal - discount < freeOver
    ? freeOver - (subtotal - discount)
    : 0;

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
    if (!shippingMethod) {
      toast.error("请选择配送方式");
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
        // 跳转前不重置 submitting：浏览器即将卸载本页，保持 disabled 防止用户误点导致重复下单
        window.location.href = res.paymentUrl;
      } else {
        // 后端未返回支付链接（罕见；走 mock 时若用户选了「去支付」但网关失败会出现）
        toast.success(t("Order submitted"));
        setSubmitting(false);
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
            <div className="rounded-md border border-dashed border-warning/40 bg-warning/[0.06] p-3 text-sm">
              <p className="text-foreground">{t("No shipping address yet — please add one first.")}</p>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="mt-2"
                onClick={() => setAddressDialogOpen(true)}
              >
                {t("Add a shipping address")}
              </Button>
            </div>
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
          {addresses.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddressDialogOpen(true)}
            >
              {t("Add a shipping address")}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* 2. Shipping method - 来自 DB */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4" />
            {t("2. Shipping method")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shippingMethods.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无可用配送方式，请联系客服。</p>
          ) : (
            <RadioGroup
              value={shippingMethod}
              onValueChange={setShippingMethod}
              className="space-y-2"
            >
              {shippingMethods.map((m) => {
                const methodFree =
                  appliedCoupon?.freeShipping === true ||
                  (m.freeOver > 0 && subtotal - discount >= m.freeOver);
                const methodFee = methodFree ? 0 : m.fee;
                const label = lang === "zh" ? m.name : (m.nameEn ?? m.name);
                const desc = lang === "zh"
                  ? (m.description ?? m.etaZh)
                  : (m.descriptionEn ?? m.etaEn);
                return (
                  <Label
                    key={m.id}
                    htmlFor={`ship-${m.id}`}
                    className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary"
                  >
                    <span className="flex min-w-0 items-start gap-3 text-sm">
                      <RadioGroupItem value={m.code} id={`ship-${m.id}`} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block font-medium">{label}</span>
                        {desc ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {desc}
                          </span>
                        ) : null}
                        {m.isCashOnDelivery ? (
                          <span className="mt-1 inline-block rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                            {lang === "zh" ? "货到付款" : "Cash on Delivery"}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-sm font-medium">
                      {methodFree && m.fee > 0 ? (
                        <span className="text-success">{t("Free shipping")}</span>
                      ) : m.isCashOnDelivery ? (
                        <span className="text-xs text-muted-foreground">
                          {lang === "zh" ? "到付" : "Pay on delivery"}
                        </span>
                      ) : m.fee === 0 ? (
                        t("Free shipping")
                      ) : (
                        format(m.fee)
                      )}
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>
          )}
          {/* 凑单免邮提示 */}
          {toFreeShipping > 0 && currentMethod && !currentMethod.isCashOnDelivery ? (
            <p className="mt-3 rounded-md border border-dashed border-primary/40 bg-primary/[0.04] p-2 text-xs text-foreground/80">
              {lang === "zh" ? (
                <>
                  再凑 <span className="font-bold text-primary">{format(toFreeShipping)}</span>{" "}
                  即可享 <strong>免邮</strong>（满 {format(freeOver)} 免邮）
                </>
              ) : (
                <>
                  Spend <span className="font-bold text-primary">{format(toFreeShipping)}</span> more
                  to unlock <strong>free shipping</strong> (over {format(freeOver)})
                </>
              )}
            </p>
          ) : null}
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
                  ? t(" (free shipping)")
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
            <div className="flex flex-wrap gap-2">
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
                  {line.isPresale ? (
                    <span className="mt-0.5 inline-block rounded bg-warning/10 px-1 py-px text-[10px] font-medium text-warning">
                      {lang === "zh" ? "预售" : "Pre-order"}
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
                {currentMethod?.isCashOnDelivery ? (
                  <span className="text-xs text-warning">
                    {lang === "zh" ? `到付 ${format(currentMethod.fee)}` : `Pay on delivery ${format(currentMethod.fee)}`}
                  </span>
                ) : freeShipping ? (
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
        <Button size="lg" disabled={submitting || !selectedAddressId} onClick={() => void handleSubmit()}>
          {submitting ? t("Submitting…") : t("Place order · {total}", { total: format(estimatedTotal) })}
        </Button>
      </div>

      {addressDialogOpen ? (
        <AddressForm
          open={addressDialogOpen}
          onOpenChange={setAddressDialogOpen}
          onSaved={() => {
            // 重新拉取地址列表（保持默认值状态正确）
            void (async () => {
              try {
                const res = await apiFetch<{ addresses: ShopAddress[] }>(
                  "/api/user/addresses",
                );
                const list = res?.addresses ?? [];
                setAddresses(list);
                const last = list.find((a) => a.isDefault) ?? list[list.length - 1] ?? null;
                if (last) setSelectedAddressId(last.id);
                toast.success("地址已保存");
              } catch {
                toast.error("地址已保存，但列表刷新失败");
              }
            })();
          }}
        />
      ) : null}
    </div>
  );
}

// React default import shim
import * as React from "react";
