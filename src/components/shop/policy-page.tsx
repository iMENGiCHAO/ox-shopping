import type { ReactNode } from "react";
import { getT } from "@/lib/shop-i18n-server";

/**
 * 内容页共用版式（服务端组件）—— 政策页 / 无障碍声明 / 隐私选择。
 *
 * 容器与原站实测一致：**`max-width: 720px` + `padding: 20px`**（正文列 680px，
 * 原站实测 679px）。此前用 `container max-w-3xl`（768px）会与内容页列宽错位，
 * 也与 FAQ 页的 720px 列宽不一致 —— 原站全站只有「48px 内边距全宽容器」和
 * 「720px 内容容器」两套（见 docs/PARITY_AUDIT §二之四 F20）。
 */
export async function PolicyPage({
  title,
  updatedAt,
  footer,
  children,
}: {
  title: string;
  updatedAt: string;
  /** 正文之后的附加区块（如可执行的行动入口） */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = await getT();
  return (
    <div className="content-shell pb-10 pt-[var(--page-title-pt)]">
      {/* 原站实测：H1 **居中**、字号是**流式**的（375 → 20px，1216 → 26.5639px，
          见 globals.css 的 `--page-title-size`）；行盒 37px；上内边距也是响应式的
          （<1000 → 40px，≥1000 → 64px，见 `--page-title-pt`）。
          此前写死「左对齐 24px @y105」→ 桌面字号偏小、移动端偏大。 */}
      <h1 className="text-center text-[length:var(--page-title-size)] font-normal leading-[37px] text-foreground">
        {title}
      </h1>
      {/* 说明：原站这几页**没有** "Last updated" 行 —— 这是本地刻意保留的
          （政策页标注更新时间的通行做法），已随标题一起居中。 */}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t("Last updated:")} {updatedAt}
      </p>
      {/* 官方样式：无边框卡片，正文直接排版（15px / 行高 25px / 块间距 32px） */}
      <div className="prose-page mt-8 max-w-none [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
      {footer ? <div className="mt-10">{footer}</div> : null}
    </div>
  );
}
