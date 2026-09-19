import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 数据表格单元格 — 抗长内容撑列三件套
 *
 *  - CellText：纯文字（truncate + title 完整内容）
 *  - CellLine：单行（避免 div 多行撑高）
 *  - CellPair：双行布局（主 + 副，常见"姓名/邮箱"）
 *  - CellStack：垂直堆叠多行
 *
 * 用法：放 TableCell 里，不需要再写 truncate / max-w / title。
 */
export function CellText({
  value,
  title,
  className,
}: {
  value: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("truncate", className)} title={title ?? (typeof value === "string" ? value : undefined)}>
      {value}
    </div>
  );
}

/** 单行 Cell（确保不换行 + truncate） */
export function CellLine({
  value,
  title,
  className,
}: {
  value: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("truncate whitespace-nowrap", className)}
      title={title ?? (typeof value === "string" ? value : undefined)}
    >
      {value}
    </div>
  );
}

/** 双行布局（主行 + 副行）。className 作用于外层容器（如 font-mono / tabular-nums）。 */
export function CellPair({
  primary,
  secondary,
  className,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="truncate text-sm font-medium" title={typeof primary === "string" ? primary : undefined}>
        {primary}
      </div>
      {secondary ? (
        <div
          className="truncate text-xs text-muted-foreground"
          title={typeof secondary === "string" ? secondary : undefined}
        >
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

/** 垂直堆叠多行（如时间区间） */
export function CellStack({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-0.5", className)}>{children}</div>;
}
