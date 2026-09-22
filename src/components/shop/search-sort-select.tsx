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
 * 原站形态（2026-09-20 用 Playwright 直连实测，1216×900/dsf1）：
 * - 它是工具栏里的一个**按钮**（`collection-toolbar__button`）：
 *   字号 **11px**、`padding: 18px 46px`、高 **54**（占满工具栏），
 *   **无边框、无底色**，右缘贴视口右缘（文字右缘因此落在内容右缘 1168）
 * - 触发器**始终显示 `Sort by`**，不随选中项变化（占位符语义）
 * - 工具栏（含上下两条 1px 线）在页面层渲染，不在本组件
 *
 * 跳转时保留 q、in_stock、price_min、price_max 等参数。
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
          // 原站：占满工具栏高度（`h-full` 让父级的 items-stretch 生效）、
          // 左右内边距 46、字号 11px、无边框无底色
          "h-full w-auto gap-2 rounded-none border-0 bg-transparent px-[var(--search-toolbar-btn-pad-x)] text-[length:var(--search-toolbar-btn-fs)] text-foreground shadow-none focus:ring-0 focus:ring-offset-0 data-[state=open]:border-0",
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
