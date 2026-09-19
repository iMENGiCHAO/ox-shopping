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
    <div className="content-shell py-10">
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {t("Last updated:")} {updatedAt}
      </p>
      {/* 官方样式：无边框卡片，正文直接排版（15px / 行高 25px / 块间距 32px） */}
      <div className="prose-page max-w-none [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
      {footer ? <div className="mt-10">{footer}</div> : null}
    </div>
  );
}
