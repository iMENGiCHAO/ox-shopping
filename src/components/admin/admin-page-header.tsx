import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Admin page header: title + description + right action area
 *
 * 设计原则：
 *  - 移动端：标题/描述/action 三段垂直堆叠（避免挤一行）
 *  - 桌面端（md+）：action 右对齐，标题左对齐
 *  - 标题超长截断 + tooltip，避免撑爆
 *  - description 2 行 line-clamp 限高
 */
export interface AdminPageHeaderProps {
  title: string;
  description?: string;
  /** Right action area (buttons, etc.) */
  actions?: ReactNode;
  className?: string;
}

export function AdminPageHeader({ title, description, actions, className }: AdminPageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 pb-2 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1
          className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl"
          title={title}
        >
          {title}
        </h1>
        {description ? (
          <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
