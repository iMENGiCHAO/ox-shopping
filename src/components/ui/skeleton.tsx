import type * as React from "react";

import { cn } from "@/lib/utils";

/** Skeleton 加载占位组件：灰色脉冲动画，用于加载态 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
