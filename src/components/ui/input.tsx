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
          // 占位符颜色 = 前景色（原站实测为**纯黑 #1C1C1C**，不是灰）：
          // 登录页 E-mail/Password 与 /search 的 "Search..." 占位符实测最深像素均为 rgb(28,28,28)。
          "flex h-12 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-[15px] font-normal ring-offset-background transition-[box-shadow,border-color] file:border-0 file:bg-transparent file:text-[15px] file:font-medium placeholder:text-foreground focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
