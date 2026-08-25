"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CURRENCIES } from "@/components/shop/currency";
import { useCurrency } from "@/components/shop/currency-provider";
import { cn } from "@/lib/utils";

/** 头部币种选择器(shop.x.com 式下拉，如 USD $ → 选国家/币种) */
export function CurrencySelect({
  withFlag = true,
  showCountry = false,
  align = "right",
  direction = "down",
  className,
}: {
  withFlag?: boolean;
  showCountry?: boolean;
  align?: "left" | "center" | "right";
  /** 弹出方向:黑底 footer 内用 up,避免向下展开露白 */
  direction?: "down" | "up";
  className?: string;
}) {
  const { code, def, setCode } = useCurrency();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点组件外部任意空白处 / 按 Esc → 收起
  // （不能用 fixed 遮罩：顶栏 backdrop-blur 会改变内部 fixed 的定位基准，遮罩盖不到页面其余区域）
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm opacity-65 transition-opacity hover:opacity-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {withFlag ? <span className="text-base leading-none">{def.flag}</span> : null}
        {showCountry ? `${def.country} (${code} ${def.symbol})` : `${code} ${def.symbol}`}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <ul
          role="listbox"
          className={cn(
            "absolute z-50 max-h-80 w-56 overflow-auto border border-border bg-card text-foreground shadow-lg",
            direction === "up" ? "bottom-full mb-2" : "top-full mt-2",
            align === "right" && "right-0",
            align === "left" && "left-0",
            align === "center" && "left-1/2 -translate-x-1/2",
          )}
        >
          {CURRENCIES.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                role="option"
                aria-selected={c.code === code}
                onClick={() => {
                  setCode(c.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-secondary ${
                  c.code === code ? "font-semibold text-foreground" : "text-foreground/70"
                }`}
              >
                <span>
                  {c.country} ({c.code} {c.symbol})
                </span>
                {c.code === code ? <span className="text-foreground">✓</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
