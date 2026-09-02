"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 可关闭的展开按钮（官方 Availability/Sort by 同构）：点击开合、点外部或 Esc 关闭 */
export function SearchPopover({
  label,
  children,
  className,
  align = "right",
}: {
  label: string;
  children: ReactNode;
  className?: string;
  /** 弹出面板对齐：left=从按钮向左锚定（按钮在左侧时向右展开）；right=向右锚定 */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex h-full cursor-pointer items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-foreground"
      >
        {label}
        <svg
          aria-hidden="true"
          width="10"
          viewBox="0 0 10 10"
          fill="none"
          className={cn("transition-transform", open && "rotate-180")}
        >
          <path d="m1 3 4 4 4-4" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
        </svg>
      </button>
      {open ? (
        <div className={`absolute top-full z-30 mt-0 ${align === "left" ? "left-0" : "right-0"}`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
