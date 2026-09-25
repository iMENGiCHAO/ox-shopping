"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CURRENCIES } from "@/components/shop/currency";
import { useCurrency } from "@/components/shop/currency-provider";
import { cn } from "@/lib/utils";

/** 头部币种选择器(上游参考站 式下拉，如 USD $ → 选国家/币种) */
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
        /* 字号 11px / 行盒 16px —— 原站实测（页头 "USD $" 墨迹 31×9、页脚
           "United States (USD $)" 墨迹 108×10；本地同为 `text-xs` 12px 时分别宽 8.3%）。
           行盒保持 16px（`leading-4`），故纵向节奏与原来完全一致。 */
        className="flex items-center gap-2.5 text-[11px] leading-4 opacity-65 transition-opacity hover:opacity-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {withFlag ? (
          /* 旗帜用**图片**而非 emoji —— 对齐原站（原站是 20×15 的 4:3 旗帜图，
             取自 Shopify 的 `static/images/flags/<cc>.svg`）。本地自持同名 4:3 SVG：
             `public/flags/<flagCode>.svg`。
             ⚠️ 不要改回 emoji：Windows 的 Chrome/Firefox 不渲染国旗 emoji，
             会退化成 "US" 两个字母（这是可上线的硬伤）。 */
          <img
            src={`/flags/${def.flagCode}.svg`}
            alt=""
            aria-hidden="true"
            width={20}
            height={15}
            className="h-[15px] w-[20px] shrink-0"
          />
        ) : null}
        {showCountry ? `${def.country} (${code} ${def.symbol})` : `${code} ${def.symbol}`}
        {/* 箭头 16px —— 原站实测墨迹：页头 8×5、页脚 10×6；本地原 `h-2.5 w-2.5`（10px 盒）
            只有 6×3。lucide ChevronDown 在 16px 盒下的墨迹约 9.3×5.3，两侧都更贴近。 */}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <ul
          role="listbox"
          className={cn(
            "currency-sheet absolute z-50 max-h-80 w-56 overflow-auto border border-white/10 bg-ink text-ink-foreground shadow-lg",
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
                // 黑底菜单：文字用白色(ink-foreground)，不能用 text-foreground(正文黑字→黑底黑字看不见)；
                // hover 用白色半透明而非 bg-secondary(避免突变)
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/10 ${
                  c.code === code
                    ? "font-semibold text-ink-foreground"
                    : "text-ink-foreground/70"
                }`}
              >
                <span>
                  {c.country} ({c.code} {c.symbol})
                </span>
                {c.code === code ? <span className="text-ink-foreground">✓</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
