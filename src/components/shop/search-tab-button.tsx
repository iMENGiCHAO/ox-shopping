"use client";

import { cn } from "@/lib/utils";

/**
 * 搜索 tab 按钮 —— **页头联想面板**与 **搜索页** 共用同一套样式。
 *
 * 依据：原站两处的 tab 规格实测完全一致（2026-09-20，Playwright 直连原站）：
 *   - `button.h6`，字号 **12px**，`padding-bottom: 10px` ⇒ 盒高 30
 *   - 两个 tab 的左缘间距 **70px**
 *   - 激活项用 `box-shadow: 0 1px 0 0 <线色>` 作下划线（不是 border）
 *   - 未激活项更淡
 *
 * 两处底色不同，故用 `tone` 区分线色与字色：
 *   - `on-dark`：页头面板（黑底）→ 白字 + 白线（原站 `rgb(255,255,255)`）
 *   - `on-light`：搜索页（白底）→ 深字 + 深线（像素采样 `rgb(28,28,28)`）
 *
 * ⚠️ 注释里不要出现 `星号加斜杠` 的字符组合（例如给路径加粗时的「星号星号斜杠」）：
 * 那会**提前终止块注释**，后面的文字被当成代码 —— 本次就因此写坏过一次。
 */
export interface SearchTabButtonProps {
  active: boolean;
  tone: "on-dark" | "on-light";
  onClick: () => void;
  children: React.ReactNode;
}

export function SearchTabButton({ active, tone, onClick, children }: SearchTabButtonProps) {
  const dark = tone === "on-dark";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "pb-[var(--search-tab-pad-b)] text-[12px] leading-5 transition-opacity",
        dark ? "text-white" : "text-foreground",
        active
          ? dark
            ? "[box-shadow:0_1px_0_0_#fff]"
            : "[box-shadow:0_1px_0_0_#1c1c1c]"
          : "opacity-65 hover:opacity-100",
      )}
    >
      {children}
    </button>
  );
}
