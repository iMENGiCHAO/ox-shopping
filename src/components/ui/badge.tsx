import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge
 * - variants: default | secondary | destructive | outline | success | warning | info | primary | muted
 */
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-foreground bg-foreground text-background",
        secondary: "border-border bg-secondary text-foreground/80",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline: "border-input bg-card text-foreground",
        success: "border-transparent bg-success/10 text-success",
        warning: "border-transparent bg-warning/10 text-warning",
        info: "border-transparent bg-info/10 text-info",
        primary: "border-primary bg-primary text-primary-foreground",
        muted: "border-border bg-secondary text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
