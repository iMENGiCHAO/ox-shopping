"use client";

import { useState } from "react";
import { SearchTabButton } from "@/components/shop/search-tab-button";
import { useT } from "@/components/shop/lang-provider";

/**
 * `/search` 页的 `Products` / `Pages` tab。
 *
 * 原站实测（2026-09-20，Playwright 直连，1216×900/dsf1）：
 *   - 两个 tab **居中成组**：`Products` x=532 / `Pages` x=650（间距 70），
 *     组宽 152 → 中心 608 = 内容中心 ✓
 *   - 12px、下内边距 10px、激活项深色下划线（像素采样 `rgb(28,28,28)`）
 *   - tab 组下方一条 `rgb(221,221,221)` 细线，**只跨组宽**（不是整幅）
 *   - tab 行 y=255..285；其下 32px 处是工具栏上边线 y=317
 *
 * 用**客户端状态**切换而不是 URL 参数：原站是 `<button>`，切换不刷新页面。
 * 两个面板由服务端渲染后作为 props 传入，数据仍走 RSC（避免把整页改成客户端组件）。
 *
 * ⚠️ 此前本页把 `Products` 做成一个居中 18px 的 `<h2>`，并把 `Pages` 结果放在页面底部
 * 作为独立一段 —— 两处都与原站不符（原站是 tab）。
 */
export function SearchResultTabs({
  products,
  pages,
}: {
  products: React.ReactNode;
  pages: React.ReactNode;
}) {
  const t = useT();
  const [tab, setTab] = useState<"products" | "pages">("products");

  return (
    <>
      <div className="mt-[48px] flex justify-center" role="tablist" aria-label={t("Search")}>
        <div className="flex gap-x-[var(--search-tab-gap)] border-b border-border">
          <SearchTabButton
            active={tab === "products"}
            tone="on-light"
            onClick={() => setTab("products")}
          >
            {t("Products")}
          </SearchTabButton>
          <SearchTabButton active={tab === "pages"} tone="on-light" onClick={() => setTab("pages")}>
            {t("Pages")}
          </SearchTabButton>
        </div>
      </div>
      <div role="tabpanel">{tab === "products" ? products : pages}</div>
    </>
  );
}
