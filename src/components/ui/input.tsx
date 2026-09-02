import * as React from "react";

import { cn } from "@/lib/utils";

/** Input — square, hairline border, black focus ring (shop.x.com) */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-[15px] font-normal ring-offset-background transition-[box-shadow,border-color] file:border-0 file:bg-transparent file:text-[15px] file:font-medium placeholder:text-muted-foreground/60 focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
