import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Product grid — mobile 2 / desktop 3-4 columns, generous gaps */
export function ProductGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-3 sm:gap-y-16",
        className,
      )}
    >
      {children}
    </div>
  );
}
