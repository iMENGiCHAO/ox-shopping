import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/** 分页可见页码项：数字页码，或省略号标记 */
type PageItem = number | "ellipsis-start" | "ellipsis-end";

/**
 * 计算可见页码：首尾固定为 1 / totalPages，当前页附近 ±2，
 * 中间被跳过的部分用省略号(…)代替。
 */
function buildPageItems(current: number, total: number): PageItem[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: PageItem[] = [1];
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  if (start > 2) items.push("ellipsis-start");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push("ellipsis-end");
  items.push(total);
  return items;
}

export interface PaginationProps {
  /** 当前页码(从 1 开始) */
  page: number;
  /** 总页数 */
  totalPages: number;
  /** 提供时渲染 <Link href>(服务端友好，利于 SEO/分享链接)；与 onPageChange 同时提供时优先 Link */
  hrefBuilder?: (page: number) => string;
  /** 提供时渲染 <button onClick>(纯客户端交互) */
  onPageChange?: (page: number) => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  hrefBuilder,
  onPageChange,
  className,
}: PaginationProps) {
  // 只有一页时不渲染分页
  if (totalPages <= 1) return null;

  const current = Math.min(Math.max(page, 1), totalPages);
  const items = buildPageItems(current, totalPages);
  const hasPrev = current > 1;
  const hasNext = current < totalPages;

  /** 渲染可点击的页码入口：禁用态渲染 span，否则优先 Link、其次 button */
  const renderPageLink = (
    target: number,
    children: ReactNode,
    disabled = false,
    ariaLabel?: string,
  ) => {
    const classes = cn(
      buttonVariants({ variant: "ghost", size: "icon" }),
      "h-8 w-8",
      disabled && "pointer-events-none opacity-50",
    );
    if (disabled) {
      return (
        <span className={classes} aria-hidden="true">
          {children}
        </span>
      );
    }
    if (hrefBuilder) {
      return (
        <Link href={hrefBuilder(target)} className={classes} aria-label={ariaLabel}>
          {children}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className={classes}
        aria-label={ariaLabel}
        onClick={() => onPageChange?.(target)}
      >
        {children}
      </button>
    );
  };

  return (
    <nav className={cn("flex items-center justify-center gap-1", className)} aria-label="Pagination">
      {renderPageLink(current - 1, <ChevronLeft className="h-4 w-4" />, !hasPrev, "Previous")}
      {items.map((item) => {
        // 省略号：不可点击
        if (item === "ellipsis-start" || item === "ellipsis-end") {
          return (
            <span
              key={item}
              className="flex h-8 w-8 items-center justify-center text-sm text-muted-foreground"
            >
              …
            </span>
          );
        }
        // 当前页：高亮展示，不可点击
        if (item === current) {
          return (
            <span
              key={item}
              aria-current="page"
              className={cn(buttonVariants({ variant: "default", size: "icon" }), "h-8 w-8")}
            >
              {item}
            </span>
          );
        }
        // 普通页码
        if (hrefBuilder) {
          return (
            <Link
              key={item}
              href={hrefBuilder(item)}
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}
            >
              {item}
            </Link>
          );
        }
        return (
          <button
            key={item}
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}
            onClick={() => onPageChange?.(item)}
          >
            {item}
          </button>
        );
      })}
      {renderPageLink(current + 1, <ChevronRight className="h-4 w-4" />, !hasNext, "Next")}
    </nav>
  );
}
