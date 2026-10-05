"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 规格选择器 —— **原生 radio + 内联展开**（大爷 2026-10-05 定案，对齐原站真实实现）。
 *
 * 为什么替换 Radix Select（原实现）：
 *   原站 shop.x.com 的规格控件是 `<fieldset>` + **原生 radio**（实地抓取确认），
 *   点击即选中、面板瞬时开合、无 portal / 无 popper 定位 / 无焦点管理库 ——
 *   点规格零开销（长任务实测 0ms）。而 Radix 浮层每次打开要挂载 portal + 计算
 *   定位 + 注册选项 + 焦点管理，生产构建实测 **90~126ms 主线程长任务**
 *   （dev 模式放大到 700~1500ms），这就是大爷感知的「顿一下」。
 *
 * 本实现保留原站的**下拉外观**，但底层换成原生机制：
 *   · 触发器 = 普通 `<button>`（外观与原 SelectTrigger 逐类一致）
 *   · 面板 = **常驻 DOM** 的内联列表，仅用 `hidden` 切换显隐 → 点开零挂载开销
 *   · 选项 = `<label>` + 原生 `<input type="radio">`（`.sr-only`）→ 方向键切换、
 *     空格选中、屏幕阅读器语义全部由浏览器原生提供
 *   · 移动端（<640px）由 globals.css 的 `.variant-panel` 规则改为底部满宽展开，
 *     与原站移动端底部选择器一致
 *
 * 售罄选项**仍可选**（选中后 CTA 切到货提醒）——与原站及既有行为一致。
 */
export interface VariantSelectProps {
  /** 规格组名（如 "Size"）：同时作为 radio group 的 name 与 aria-label */
  groupName: string;
  /** 当前选中值；空串 = 尚未选择 */
  value: string;
  /** 该组全部可选值（顺序与后台录入一致） */
  options: string[];
  /** 售罄判定（仅用于文案标注，不阻止选择） */
  isSoldOut: (v: string) => boolean;
  /** 选中回调 */
  onChange: (v: string) => void;
  /** 「售罄」本地化文案 */
  soldOutLabel: string;
  /** 未选择时触发器展示的占位文案 */
  placeholder?: string;
}

export function VariantSelect({
  groupName,
  value,
  options,
  isSoldOut,
  onChange,
  soldOutLabel,
  placeholder,
}: VariantSelectProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  /* 关闭交互：点击外部 / Escape。仅在打开期间挂监听（关闭态零常态开销）。 */
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /* 展开时把焦点交给当前选中项（键盘用户可直接方向键切换）。
     preventScroll 是硬要求：PDP 是 sticky 双栏，focus 引发滚动会让大图/页面抖。 */
  React.useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLInputElement>('input[type="radio"]:checked') ??
      panel?.querySelector<HTMLInputElement>('input[type="radio"]');
    target?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={groupName}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-[46px] w-full items-center justify-between rounded-none border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus-visible:ring-0",
          open && "border-foreground",
        )}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value || placeholder || groupName}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {/* 常驻 DOM 的内联面板：`hidden` 切换显隐 —— 点开零挂载、零定位计算 */}
      <div
        ref={panelRef}
        role="listbox"
        aria-label={groupName}
        hidden={!open}
        className="variant-panel absolute left-0 top-full z-[60] w-full border border-input bg-card shadow-md"
      >
        {options.map((option) => {
          const out = isSoldOut(option);
          return (
            <label
              key={option}
              className="flex cursor-pointer select-none items-center px-3 py-2 text-sm hover:bg-muted has-[:focus-visible]:bg-muted has-[:checked]:font-medium"
            >
              <input
                type="radio"
                name={groupName}
                value={option}
                checked={value === option}
                onChange={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className="sr-only"
              />
              <span className="truncate">
                {out ? `${option} — ${soldOutLabel}` : option}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
