import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Product grid —— 2 列（<700px）/ 3 列（≥700px），列间距 48px、行间距 64px。
 * 间距全部来自 `.plp-grid` 令牌（globals.css），取自 上游参考站 /collections/all 实测值：
 * 内容宽 1120 → (1120 − 2×48) / 3 = 341px 卡片，与原站 341×341 完全吻合。
 */
export function ProductGrid({
  children,
  className,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  /** home = 首页网格：列间距 12px（原站首页与集合页间距刻意不同） */
  variant?: "default" | "home";
}) {
  return (
    <div className={cn("plp-grid", variant === "home" && "home-grid", className)}>{children}</div>
  );
}
