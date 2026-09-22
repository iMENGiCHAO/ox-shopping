"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
 * Search sidebar filters — shop.x.com 桌面端左侧栏：
 * - Availability（手风琴，**默认折叠** —— 原站实测，此前注释写成「默认展开」是错的）：
 *   In stock only 开关
 * - Price（手风琴，**默认折叠**）：价格滑块 + <symbol>min to <symbol>max 输入框
 *
 * 移动端隐藏（shop.x.com 移动端筛选在顶部弹出菜单）。
 * 货币符号取自当前展示币种（useCurrency().def.symbol），不再写死。
 * 标签文案走 i18n 词典（英文源串），不写死英文。
 */

export function SearchSidebarFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  // 当前展示币种符号（USD→$、CNY→¥、EUR→€ …）—— 跟随页头币种选择器
  const { def: currency } = useCurrency();

  const inStock = searchParams.get("in_stock") === "1";
  const minParam = searchParams.get("price_min");
  const maxParam = searchParams.get("price_max");
  const minPrice = minParam ? Number(minParam) : 0;
  // 滑块满格 = "不限上限"。默认用满格值，且**不写入** price_max，
  // 否则用户仅修改最低价就会把默认上限写进 URL，误过滤掉更贵的商品。
  const maxPrice = maxParam ? Number(maxParam) : PRICE_SLIDER_MAX;

  // 滑块本地状态（拖动时不立即跳转，松手后才跳转）
  const [priceRange, setPriceRange] = useState<[number, number]>([minPrice, maxPrice]);
  const [minInput, setMinInput] = useState(String(minPrice));
  const [maxInput, setMaxInput] = useState(String(maxPrice));

  // URL 变化时同步本地状态
  useEffect(() => {
    setPriceRange([minPrice, maxPrice]);
    setMinInput(String(minPrice));
    setMaxInput(String(maxPrice));
  }, [minPrice, maxPrice]);

  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      // 保留 q、tab、sort
      for (const [k, v] of Object.entries(overrides)) {
        if (v === undefined || v === "") params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      return qs ? `/search?${qs}` : "/search";
    },
    [searchParams],
  );

  const toggleInStock = useCallback(
    (checked: boolean) => {
      router.push(buildUrl({ in_stock: checked ? "1" : undefined }));
    },
    [buildUrl, router],
  );

  const commitPrice = useCallback(
    (min: number, max: number) => {
      const safeMin = Math.max(0, Math.min(min, max));
      const safeMax = Math.max(safeMin, Math.min(max, PRICE_INPUT_MAX));
      router.push(
        buildUrl({
          price_min: safeMin > 0 ? String(safeMin) : undefined,
          // 满格（或超过滑块范围）视为不限上限，不写入参数
          price_max: safeMax >= PRICE_SLIDER_MAX ? undefined : String(safeMax),
        }),
      );
    },
    [buildUrl, router],
  );

  const handleSliderChange = useCallback((value: number[]) => {
    const lo = value[0] ?? 0;
    const hi = value[1] ?? 100;
    setPriceRange([lo, hi]);
    setMinInput(String(lo));
    setMaxInput(String(hi));
  }, []);

  const handleSliderCommit = useCallback(
    (value: number[]) => {
      commitPrice(value[0] ?? 0, value[1] ?? PRICE_SLIDER_MAX);
    },
    [commitPrice],
  );

  const handleMinBlur = useCallback(() => {
    const n = Number(minInput);
    if (!Number.isFinite(n)) {
      setMinInput(String(priceRange[0]));
      return;
    }
    commitPrice(n, priceRange[1]);
  }, [minInput, priceRange, commitPrice]);

  const handleMaxBlur = useCallback(() => {
    const n = Number(maxInput);
    if (!Number.isFinite(n)) {
      setMaxInput(String(priceRange[1]));
      return;
    }
    commitPrice(priceRange[0], n);
  }, [maxInput, priceRange, commitPrice]);

  // 原站实测：两个手风琴**默认折叠**（此前注释写成「实测默认展开」，与事实相反）
  const defaultValue = useMemo<string[]>(() => [], []);

  return (
    /* 断点 **1000px**（不是 Tailwind 的 `lg`=1024）：原站二分实测 ——
       999px 时侧栏不显示、由 `Filter` 按钮 + 抽屉承担；1000px 起侧栏出现
       （`form.facets` x=48 w=240，同时网格左移到 x=320）。 */
    <aside
      className="hidden w-[240px] shrink-0 min-[1000px]:block"
      aria-label={t("Search filters")}
    >
      <Accordion type="multiple" defaultValue={defaultValue} className="w-full">
        {/* Availability */}
        <AccordionItem value="availability" className="border-b border-border">
          <AccordionTrigger className="py-4 text-[13px] font-medium text-foreground hover:no-underline">
            {t("Availability")}
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-[14px] text-foreground/80">{t("In stock only")}</span>
              <Switch
                checked={inStock}
                onCheckedChange={toggleInStock}
                aria-label={t("In stock only")}
              />
            </label>
          </AccordionContent>
        </AccordionItem>

        {/* Price */}
        <AccordionItem value="price" className="border-b border-border">
          <AccordionTrigger className="py-4 text-[13px] font-medium text-foreground hover:no-underline">
            {t("Price")}
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
              {/* 价格滑块 */}
              <Slider
                value={priceRange}
                min={0}
                max={PRICE_SLIDER_MAX}
                step={1}
                onValueChange={handleSliderChange}
                onValueCommit={handleSliderCommit}
                aria-label={t("Price range")}
              />
              {/* {symbol} min to {symbol} max 输入框（符号跟随当前展示币种） */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-foreground/50">
                    {currency.symbol}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={minInput}
                    onChange={(e) => setMinInput(e.target.value)}
                    onBlur={handleMinBlur}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="h-9 w-full border border-border bg-background pl-6 pr-2 text-[13px] text-foreground focus:border-foreground focus:outline-none"
                    aria-label={t("Minimum price")}
                  />
                </div>
                <span className="text-[13px] text-foreground/50">{t("to")}</span>
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-foreground/50">
                    {currency.symbol}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={maxInput}
                    onChange={(e) => setMaxInput(e.target.value)}
                    onBlur={handleMaxBlur}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="h-9 w-full border border-border bg-background pl-6 pr-2 text-[13px] text-foreground focus:border-foreground focus:outline-none"
                    aria-label={t("Maximum price")}
                  />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </aside>
  );
}
