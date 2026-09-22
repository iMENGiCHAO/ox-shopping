import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/shop-i18n-server";

/**
 * 404 兜底页 —— 文案与版式**逐字对齐原站**（2026-09-20 取证）。
 *
 * 原站实测（`/this-page-does-not-exist-404`）：
 *   - `<title>` = **`404 Not Found`**（本地此前继承了 layout 的 `default: siteName`，显示成店名）
 *   - H1 = `404`，计算字号 **17.641px**（原站 `h5` 档，与搜索框同档；本地此前是 18px）
 *   - 正文 = `We could not find the page you were looking for. Please use the navigation
 *     or the button below to go back to our website.`（逐字）
 *   - 按钮 = **`Continue shopping`** → `/collections/all`（本地此前是 `Back to home` → `/`）
 *
 * 明确 noindex：避免「命中路由但内容不存在」的软 404 URL 被搜索引擎收录
 * （这类软 404 在流式渲染下 HTTP 状态可能仍为 200，noindex 是可靠兜底）。
 */
export const metadata: Metadata = {
  title: "404 Not Found",
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-card px-5 text-center text-foreground">
      <h1 className="text-[17.641px] font-normal leading-[1.6] tracking-[0.02em]">404</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed opacity-70">
        {t(
          "We could not find the page you were looking for. Please use the navigation or the button below to go back to our website.",
        )}
      </p>
      <Link
        href="/collections/all"
        className="btn-sweep mt-8 inline-flex h-[46px] items-center justify-center border border-border bg-card px-10 text-[15px] text-foreground"
      >
        {t("Continue shopping")}
      </Link>
    </div>
  );
}
