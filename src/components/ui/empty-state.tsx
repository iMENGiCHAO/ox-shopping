import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** EmptyState — centered content for empty lists/categories */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-foreground">
          {icon}
        </div>
      ) : null}
      <h3 className="text-xl font-medium text-foreground">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
