import type { Metadata } from "next";
import { CollectionsIndex } from "@/components/shop/collections-index";
import { getT } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // 原站实测：该页 `<title>` 是 **`Collections`**，而 H1 是 `All collections` —— 两者不同。
  // 本地此前用 h1 当标题（`All collections`），已按原站改为 `Collections`。
  return { title: t("Collections") };
}

/**
 * /collections —— 全部分类页，与原站 `/collections` 同构（4 张正方形集合卡片）。
 * 渲染体抽到 `CollectionsIndex`，与 `/products` 共用同一份实现，避免两处漂移。
 */
export default async function CollectionsPage() {
  return <CollectionsIndex />;
}
