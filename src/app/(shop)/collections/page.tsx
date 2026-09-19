import type { Metadata } from "next";
import { CollectionsIndex } from "@/components/shop/collections-index";
import { getT } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("All collections") };
}

/**
 * /collections —— 全部分类页，与原站 `/collections` 同构（4 张正方形集合卡片）。
 * 渲染体抽到 `CollectionsIndex`，与 `/products` 共用同一份实现，避免两处漂移。
 */
export default async function CollectionsPage() {
  return <CollectionsIndex />;
}
