import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Table 表格组件族(shadcn/ui 风格)
 * Table / TableHeader / TableBody / TableRow / TableHead / TableCell / TableCaption
 *
 * 响应式 + 抗长内容撑列策略：
 *  - 默认 `table-fixed` + 列宽由 TableHead.width / TableCell.width 决定（不再等分）
 *  - 长内容（如邮箱/规格）父级加 `min-w-0` + 子元素 `truncate` 兜底
 *  - 操作列用 `sticky right-0` + 实底 `bg-card` 保证横向滚动时不被挤出且不透字
 *  - 容器加 `overflow-x-auto` 防止列溢出破坏布局
 *  - 窄屏 (md 以下) 减小内边距 p-2，桌面恢复 p-4
 *
 * Sticky 列规范（.sticky-col-left / .sticky-col-right 工具类，见 globals.css）：
 *  - 实心背景 bg-card（不透字）+ 分隔线（left: border-r / right: border-l）
 *  - z 层级：表头 z-20，表体单元格 z-10（左右 sticky 不互相覆盖）
 */
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto">
      <table
        ref={ref}
        className={cn("w-full table-fixed caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "sticky top-0 z-20 bg-card [&_tr]:border-b [&_tr]:border-border [&_tr]:hover:bg-transparent",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 truncate p-2 text-left align-middle font-medium text-muted-foreground md:p-4 [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-2 align-middle md:p-4 [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

/** 表格标题(显示在表格下方) */
const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption };
