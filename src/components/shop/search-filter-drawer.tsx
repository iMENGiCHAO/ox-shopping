"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useCurrency } from "@/components/shop/currency-provider";
import { useT } from "@/components/shop/lang-provider";
import {
  PRICE_FILTER_INPUT_MAX as PRICE_INPUT_MAX,
  PRICE_FILTER_SLIDER_MAX as PRICE_SLIDER_MAX,
} from "@/lib/constants";

/**
 * `<1000px` 的 `Filter` 按钮 + 筛选抽屉 —— 对齐原站 `facets-drawer`。
 *
 * 原站实测（2026-09-20，Playwright 直连，900×900/dsf1）：
 *   - 触发按钮 `collection-toolbar__button`：11px、`padding: 18px 46px`、高 54，
 *     位于工具栏**最右**（`Sort by` 在其左），只在 <1000px 出现
 *   - 抽屉 `facets-drawer drawer drawer--sm`：**右侧 400 宽黑色面板**、带遮罩
 *   - 头部：`Filters`（17.0244px 白字）+ 右侧关闭按钮，头部高 65
 *   - 正文：`Availability` 手风琴**默认折叠**，`In stock only` 是 **`input.switch` 36×16**
 *     （⚠️ 不是复选框 —— 曾据文本代理的 markdown `- [x]` 误判，实测推翻）
 *   - 底部：**全宽**白底黑字 `View results`（360×46、14px）
 *
 * 与桌面侧栏的关键差异：抽屉**暂存**改动，点 `View results` 才写 URL。
 * 原站抽屉是覆盖在结果之上的，若逐项即时生效，用户会在抽屉背后看到页面反复重载。
 */
export function SearchFilterDrawer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const { def: currency } = useCurrency();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 暂存值（打开抽屉时从 URL 同步一次）
  const urlInStock = searchParams.get("in_stock") === "1";
  const urlMin = searchParams.get("price_min") ?? "";
  const urlMax = searchParams.get("price_max") ?? "";
  const [inStock, setInStock] = useState(urlInStock);
  const [priceRange, setPriceRange] = useState<[number, number]>([
    urlMin ? Number(urlMin) : 0,
    urlMax ? Number(urlMax) : PRICE_SLIDER_MAX,
  ]);
  const [minInput, setMinInput] = useState(urlMin || "0");
  const [maxInput, setMaxInput] = useState(urlMax || String(PRICE_SLIDER_MAX));

  useEffect(() => setMounted(true), []);

  // 每次打开时从当前 URL 重新同步，避免上次未提交的改动残留
  useEffect(() => {
    if (!open) return;
    setInStock(urlInStock);
    const lo = urlMin ? Number(urlMin) : 0;
    const hi = urlMax ? Number(urlMax) : PRICE_SLIDER_MAX;
    setPriceRange([lo, hi]);
    setMinInput(String(lo));
    setMaxInput(String(hi));
  }, [open, urlInStock, urlMin, urlMax]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** 提交：把暂存值写进 URL 并关闭抽屉（保留 q / sort 等其他参数） */
  const apply = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (inStock) params.set("in_stock", "1");
    else params.delete("in_stock");
    const lo = Math.max(0, Math.min(priceRange[0], priceRange[1]));
    const hi = Math.max(lo, Math.min(priceRange[1], PRICE_INPUT_MAX));
    if (lo > 0) params.set("price_min", String(lo));
    else params.delete("price_min");
    // 满格视为「不限上限」，不写参数
    if (hi < PRICE_SLIDER_MAX) params.set("price_max", String(hi));
    else params.delete("price_max");
    const qs = params.toString();
    setOpen(false);
    router.push(qs ? `/search?${qs}` : "/search");
  };

  return (
    <>
      {/* 触发按钮 —— 只在 <1000px 出现，位于工具栏最右，带左分隔线 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center border-l border-border px-[var(--search-toolbar-btn-pad-x)] text-[length:var(--search-toolbar-btn-fs)] text-foreground transition-colors hover:bg-accent min-[1000px]:hidden"
      >
        {t("Filter")}
      </button>

      {open && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-[999]"
              role="dialog"
              aria-modal="true"
              aria-label={t("Filters")}
            >
              {/* 遮罩（原站抽屉背后页面被压暗） */}
              <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
              {/* 右侧 400 宽黑色面板 */}
              <div className="absolute inset-y-0 right-0 flex w-[min(var(--search-drawer-w),100vw)] flex-col bg-black text-white">
                <div className="flex h-[var(--search-drawer-head-h)] shrink-0 items-center justify-between px-[var(--search-drawer-pad)]">
                  <p className="text-[length:var(--search-drawer-title-fs)]">{t("Filters")}</p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={t("Close")}
                    className="text-white transition-opacity hover:opacity-65"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.25" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-[var(--search-drawer-pad)] pt-[var(--search-drawer-pad)]">
                  {/* 原站两个手风琴**默认折叠**。触发行高 40 = 文字 20 + 下内边距 20
                      （原站 `span.accordion__toggle` 是 `padding: 0 0 20px`，**无上内边距**）。 */}
                  <Accordion type="multiple" className="w-full">
                    <AccordionItem value="availability" className="border-b border-white/20">
                      <AccordionTrigger className="pt-0 pb-[var(--search-drawer-pad)] text-[12px] font-normal text-white hover:no-underline">
                        {t("Availability")}
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <label className="flex cursor-pointer items-center justify-between gap-3">
                          <span className="text-[15px] text-white">{t("In stock only")}</span>
                          <Switch
                            checked={inStock}
                            onCheckedChange={setInStock}
                            aria-label={t("In stock only")}
                          />
                        </label>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="price" className="border-b border-white/20">
                      <AccordionTrigger className="pt-0 pb-[var(--search-drawer-pad)] text-[12px] font-normal text-white hover:no-underline">
                        {t("Price")}
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-4">
                          <Slider
                            value={priceRange}
                            min={0}
                            max={PRICE_SLIDER_MAX}
                            step={1}
                            onValueChange={(v) => {
                              const lo = v[0] ?? 0;
                              const hi = v[1] ?? PRICE_SLIDER_MAX;
                              setPriceRange([lo, hi]);
                              setMinInput(String(lo));
                              setMaxInput(String(hi));
                            }}
                            aria-label={t("Price range")}
                          />
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-white/50">
                                {currency.symbol}
                              </span>
                              <input
                                type="number"
                                min={0}
                                value={minInput}
                                onChange={(e) => {
                                  setMinInput(e.target.value);
                                  const n = Number(e.target.value);
                                  if (Number.isFinite(n))
                                    setPriceRange(([, hi]) => [Math.max(0, n), hi]);
                                }}
                                className="h-9 w-full border border-white/30 bg-transparent pl-6 pr-2 text-[13px] text-white focus:border-white focus:outline-none"
                                aria-label={t("Minimum price")}
                              />
                            </div>
                            <span className="text-[13px] text-white/50">{t("to")}</span>
                            <div className="relative flex-1">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-white/50">
                                {currency.symbol}
                              </span>
                              <input
                                type="number"
                                min={0}
                                value={maxInput}
                                onChange={(e) => {
                                  setMaxInput(e.target.value);
                                  const n = Number(e.target.value);
                                  if (Number.isFinite(n))
                                    setPriceRange(([lo]) => [lo, Math.min(n, PRICE_INPUT_MAX)]);
                                }}
                                className="h-9 w-full border border-white/30 bg-transparent pl-6 pr-2 text-[13px] text-white focus:border-white focus:outline-none"
                                aria-label={t("Maximum price")}
                              />
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                {/* 底部固定：全宽白底黑字（原站 360×46、14px，下缘距面板底 16px） */}
                <div className="shrink-0 px-[var(--search-drawer-pad)] pb-[var(--search-drawer-pad-b)] pt-[var(--search-drawer-pad)]">
                  <button
                    type="button"
                    onClick={apply}
                    className="inline-flex h-[var(--search-apply-h)] w-full items-center justify-center bg-white text-[length:var(--search-apply-fs)] text-black transition-opacity hover:opacity-85"
                  >
                    {t("View results")}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
