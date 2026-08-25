import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionTitleProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

/** Section title — centered editorial style, eyebrow micro-text */
export function SectionTitle({ title, subtitle, action, className }: SectionTitleProps) {
  return (
    <div className={cn("mb-10 flex items-end justify-between gap-4", className)}>
      <div className="space-y-1.5">
        {subtitle ? <p className="eyebrow">{subtitle}</p> : null}
        <h2 className="text-xl font-normal leading-tight tracking-[0.04em] text-foreground sm:text-2xl">
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
