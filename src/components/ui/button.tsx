import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — 上游参考站 system: square corners, regular weight.
 * - default:   near-black fill, white text, subtle hover step
 * - outline:   hairline black border, white ground, black sweeps in on hover
 * - secondary: pale gray fill
 * - ghost:     text only, dims to 65%
 * - destructive: semantic red
 * - link:      underlined text
 */
const buttonVariants = cva(
  // rounded-md 走 var(--radius)：前台 --radius=0 仍是直角（原站铁律零圆角），
  // admin-theme 下自动变为 12px Apple 圆角按钮。
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-normal ring-offset-background transition-[background-color,box-shadow,color,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-accent active:opacity-90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "btn-sweep border border-foreground bg-transparent font-normal text-foreground hover:text-primary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-muted",
        ghost:
          "text-foreground opacity-80 hover:opacity-100",
        link:
          "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-8 px-4 text-[13px]",
        lg: "h-12 px-8 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** When true, render styles on child (Slot — use with next/link) */
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
