import * as React from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * 数据表格操作区（DataTableActions）：
 *  - 桌面端（≥md）：直接展示主操作 + "更多"下拉（次要操作）
 *  - 移动端（<md）：全部收起为 "..." 下拉，避免挤爆
 *  - 颜色：Destructive 操作用红色，普通用 foreground/70
 *
 * 设计原则：
 *  - 主操作不超过 1 个（如 "查看"）
 *  - 次要操作在 "更多" 里（编辑 / 删除 / 复制 等）
 *  - 不显示重复 label 的图标
 */

export interface DataTableAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  /** 标记为破坏性（删除 / 取消 / 拒绝）— 文字变红 */
  destructive?: boolean;
  /** 分割线（在该项前插一条 separator） */
  divider?: boolean;
  /** 在桌面端直接展示的"主操作"（最多 1 个） */
  primary?: boolean;
}

interface DataTableActionsProps {
  actions: DataTableAction[];
  /** 强制模式：always-compact（移动端也用下拉） */
  compact?: boolean;
}

export function DataTableActions({ actions, compact = false }: DataTableActionsProps) {
  const primary = actions.find((a) => a.primary);
  const rest = actions.filter((a) => !a.primary);

  // 没有任何操作 → 不渲染
  if (actions.length === 0) return null;

  // 只有主操作（无次要操作）：桌面显示带文字按钮，移动端显示图标按钮，
  // 不渲染 "..."（避免空菜单）。
  if (rest.length === 0 && primary) {
    return (
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-muted-foreground hover:text-foreground md:px-2"
          onClick={primary.onClick}
          aria-label={primary.label}
        >
          {primary.icon ? <primary.icon className="h-3.5 w-3.5" /> : null}
          <span className="ml-1 hidden md:inline">{primary.label}</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      {/* 主操作（仅桌面；移动端收进 "..." 菜单） */}
      {primary && (
        <Button
          size="sm"
          variant="ghost"
          className="hidden h-8 px-2 md:inline-flex"
          onClick={primary.onClick}
          aria-label={primary.label}
        >
          {primary.icon ? <primary.icon className="h-3.5 w-3.5" /> : null}
          <span className="ml-1">{primary.label}</span>
        </Button>
      )}

      {/* "..." 菜单：有次要操作时始终提供；移动端额外收纳主操作 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label="更多操作"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          {/* 移动端：主操作也放进来（桌面已展开） */}
          {primary && compact ? (
            <DropdownMenuItem onClick={primary.onClick}>
              {primary.icon ? <primary.icon className="mr-2 h-3.5 w-3.5" /> : null}
              {primary.label}
            </DropdownMenuItem>
          ) : null}
          {primary && compact && rest.length > 0 ? <DropdownMenuSeparator /> : null}
          {rest.map((a, i) => (
            <React.Fragment key={a.label}>
              {a.divider && i > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                onClick={a.onClick}
                className={cn(a.destructive && "text-destructive focus:text-destructive")}
              >
                {a.icon ? <a.icon className="mr-2 h-3.5 w-3.5" /> : null}
                {a.label}
              </DropdownMenuItem>
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
