"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useT } from "@/components/shop/lang-provider";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { value: "relevance", labelKey: "Relevance" },
  { value: "price-ascending", labelKey: "Price, low to high" },
  { value: "price-descending", labelKey: "Price, high to low" },
] as const;

/**
 * Search sort select — shop.x.com 搜索页右侧 `Sort by` 下拉。
 *
 * 原站形态（`r2-search.png` 实测）：
 * - 触发器**始终显示 `Sort by`**，不随选中项变化（占位符语义）
 * - **无边框、无底色**，只有文字 + chevron，右对齐
 * - 上方有一条**贯通整栏**的横向分隔线（在页面层渲染，不在本组件）
 *
 * 跳转时保留 q、tab、in_stock、price_min、price_max 等参数。
 */
export function SearchSortSelect({ className }: { className?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();

  const currentSort = searchParams.get("sort") || "relevance";

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "relevance") params.delete("sort");
    else params.set("sort", value);
    const qs = params.toString();
    router.push(qs ? `/search?${qs}` : "/search");
  };

  return (
    <Select value={currentSort} onValueChange={handleChange}>
      <SelectTrigger
        aria-label={t("Sort by")}
        className={cn(
          "h-auto w-auto gap-2 rounded-none border-0 bg-transparent p-0 text-[13px] text-foreground shadow-none focus:ring-0 focus:ring-offset-0 data-[state=open]:border-0",
          className,
        )}
      >
        {/* 刻意不用 <SelectValue>：Radix 会渲染成当前选中项，而原站始终是 "Sort by" */}
        <span>{t("Sort by")}</span>
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {t(o.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
