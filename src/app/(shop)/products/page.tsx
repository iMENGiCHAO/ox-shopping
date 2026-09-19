import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CollectionsIndex } from "@/components/shop/collections-index";
import { getT } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

/**
 * /products —— 原站实测（2026-09-20 Playwright）：该 URL 返回 200 且渲染
 * `All collections` 索引页（与 `/collections` 完全相同）。
 *
 * 本地历史形态是「商品网格 + `?category=` 分类落地页」，为对齐原站：
 *  - 无参数 → 渲染集合索引（与 /collections 同一组件）
 *  - `?category=<slug>`（旧链接）→ 302 到 `/collections/<slug>`，避免死链
 */
export async function generateMetadata(): Promise<Metadata> {
  // 注意：**不要**在 generateMetadata 里 redirect（Next 官方要求）——否则重定向
  // 会在 metadata 阶段被吞掉并渲染出空白页；跳转统一放在页面组件里。
  const t = await getT();
  return { title: t("All collections") };
}

export default async function ProductsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const category = typeof sp.category === "string" ? sp.category.trim() : "";
  // 旧链接一次性迁移到原站形态的集合 URL
  if (category) redirect(`/collections/${encodeURIComponent(category)}`);
  return <CollectionsIndex />;
}
