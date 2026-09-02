import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 批量操作条（BulkActionBar）：
 *  - 选中 ≥ 1 时从顶部滑入（不挤原 toolbar）
 *  - 选中数 + 全部主操作 + 取消选择
 *  - 移动端：横向滚动 + 紧凑 padding
 */
export interface BulkAction {
  label: string;
  onClick: () => void;
  loading?: boolean;
  destructive?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
  label?: string; // "已选择 N 项"
  className?: string;
}

export function BulkActionBar({
  selectedCount,
  actions,
  onClear,
  label,
  className,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/[0.06] px-3 py-2",
        className,
      )}
      role="region"
      aria-label="批量操作"
    >
      <span className="text-xs font-medium text-foreground">
        {label ?? `已选择 ${selectedCount} 项`}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {actions.map((a) => (
          <Button
            key={a.label}
            size="sm"
            variant={a.destructive ? "outline" : "outline"}
            onClick={a.onClick}
            disabled={a.loading}
            className={cn("h-7 px-2.5 text-xs", a.destructive && "text-destructive border-destructive/40")}
          >
            {a.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          className="h-7 w-7 p-0"
          aria-label="取消选择"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
