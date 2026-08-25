"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/shop/cart-provider";
import type { SpecSelection } from "@/components/shop/types";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";
import { apiFetchRaw } from "@/lib/fetch-client";

export interface SpecGroupOption {
  name: string;
  values: string[];
  soldOutValues?: string[];
}

export interface BuyNowButtonProps {
  productId: string;
  quantity?: number;
  attributes?: SpecSelection[];
  disabled?: boolean;
  /** 售罄（非预售）：按钮变 Notify me */
  soldOut?: boolean;
  /** 规格组（Notify me 弹窗里让客户先选规格/颜色） */
  specGroups?: SpecGroupOption[];
  /** 已登录账号邮箱：Notify me 弹窗自动预填（官方行为） */
  defaultEmail?: string;
  /** 商品名（弹窗内展示，官方行为） */
  productName?: string;
  className?: string;
}

/** Buy Now: add to bag then redirect to /checkout.
 * 售罄时（官方样式）：Buy Now → Notify me，展开邮箱输入登记到货通知。 */
export function BuyNowButton({
  productId,
  quantity = 1,
  attributes,
  disabled,
  soldOut = false,
  specGroups = [],
  defaultEmail,
  productName,
  className,
}: BuyNowButtonProps) {
  const { addToCart } = useCart();
  const [pending, setPending] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  // 默认选中每组首个有货值（官方 select 行为：始终有选中项）
  const [picked, setPicked] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const g of specGroups) {
      if (g.values.length === 0) continue;
      init[g.name] = g.values.find((v) => !(g.soldOutValues ?? []).includes(v)) ?? g.values[0]!;
    }
    return init;
  });
  const [notifyState, setNotifyState] = useState<"idle" | "sending" | "done" | "dupe">("idle");
  // 弹窗用 portal 挂到 body：商品页布局链上若存在 transform/filter 祖先，
  // 会劫持内部 fixed 定位基准（弹窗错位、点击穿透到下层图片），挂 body 彻底规避
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const t = useT();

  const handleClick = async () => {
    setPending(true);
    try {
      await addToCart(productId, quantity, attributes);
      window.location.href = "/checkout";
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Could not process, please try again"),
      );
    } finally {
      setPending(false);
    }
  };

  const submitNotify = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    setNotifyState("sending");
    try {
      const j = await apiFetchRaw<{ data?: { already?: boolean } }>("/api/notify-me", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), productId, attributes: picked }),
      });
      setNotifyState(j?.data?.already ? "dupe" : "done");
    } catch (err) {
      setNotifyState("idle");
      toast.error(err instanceof Error ? err.message : t("Could not process, please try again"));
    }
  };

  // 售罄 → Notify me（官方 Restock Rocket 同款弹窗：规格下拉 + 邮箱，右上 X 关闭）
  if (soldOut) {
    const groups = specGroups.filter((g) => g.values.length > 0);
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    return (
      <div className={`w-full ${className ?? ""}`}>
        <Button
          type="button"
          onClick={() => {
            // 每次打开时以页面当前所选规格为弹窗初始值（官方行为：页面选啥弹窗带啥）
            const init: Record<string, string> = {};
            for (const s of attributes ?? []) {
              if (s.value) init[s.name] = s.value;
            }
            setPicked(init);
            setNotifyOpen(true);
          }}
          style={{ fontSize: 13 }}
          className={`${className ?? ""} border-0 bg-[#1c1c1c] font-bold uppercase tracking-[2.34px] text-white hover:bg-black hover:text-white`}
          data-notify-me="true"
        >
          {t("Notify me")}
        </Button>

        {notifyOpen && mounted ? createPortal(
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setNotifyOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            {/* 官方面板：白色、直角、#202223 文字 */}
            <div
              className="w-full max-w-[400px] bg-white p-6 text-[#202223] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {notifyState === "done" || notifyState === "dupe" ? (
                <div className="py-8 text-center">
                  <Bell className="mx-auto h-7 w-7" />
                  <p className="mt-4 text-[15px] font-medium">
                    {notifyState === "done"
                      ? t("Thank you! We will notify you when the product is available")
                      : t("You're on the list for this product")}
                  </p>
                </div>
              ) : (
                <>
                  {/* 头部：铃铛 + 标题 + 右上角 X（官方无 Cancel 按钮） */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <Bell className="h-[22px] w-[22px]" />
                      <h2 className="text-lg font-medium leading-none">{t("Notify me")}</h2>
                    </div>
                    <button
                      type="button"
                      aria-label={t("Close")}
                      onClick={() => setNotifyOpen(false)}
                      className="-mr-1 p-1 transition-opacity hover:opacity-60"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed">
                    {t(
                      "Get a notification as soon as this product is back in stock by signing up below",
                    )}
                  </p>

                  {productName ? (
                    <p className="mt-3 text-sm font-semibold">{productName}</p>
                  ) : null}

                  {/* 规格：官方为原生 select 下拉，全部可选（含售罄值——这正是登记目的） */}
                  {groups.map((g) => (
                    <select
                      key={g.name}
                      value={picked[g.name] ?? ""}
                      onChange={(e) => setPicked((p) => ({ ...p, [g.name]: e.target.value }))}
                      aria-label={g.name}
                      className="mt-3 h-11 w-full border border-[#dfe3e8] bg-white px-3 text-sm outline-none focus:border-[#202223]"
                    >
                      {g.values.map((v) => (
                        <option key={v} value={v}>
                          {(g.soldOutValues ?? []).includes(v)
                            ? `${v} — ${t("Sold out")}`
                            : v}
                        </option>
                      ))}
                    </select>
                  ))}

                  <label className="sr-only" htmlFor="notify-me-email">
                    {t("Email address")}
                  </label>
                  <input
                    id="notify-me-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("Email address")}
                    autoComplete="email"
                    className="mt-3 h-11 w-full border border-[#dfe3e8] bg-white px-3 text-sm outline-none placeholder:text-[#9aa0a6] focus:border-[#202223]"
                  />

                  <button
                    type="button"
                    disabled={notifyState === "sending" || !emailValid}
                    onClick={() => void submitNotify()}
                    className="mt-5 h-12 w-full bg-[#202223] text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-40"
                  >
                    {notifyState === "sending"
                      ? t("Submitting…")
                      : t("Notify me when available")}
                  </button>

                  <p className="mt-3 text-xs opacity-60">
                    {t("You'll only receive notifications for this product")}
                  </p>
                </>
              )}
            </div>
          </div>,
          document.body,
          ) : null}
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void handleClick()}
      disabled={disabled || pending}
      className={className}
    >
      {pending ? t("Processing…") : t("Buy Now")}
      <ArrowRight className="h-4 w-4" />
    </Button>
  );
}
