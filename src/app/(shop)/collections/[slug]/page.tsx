import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionListing } from "@/components/shop/collection-listing";
import { listCategoryTree } from "@/server/services/product.service";
import { pickName } from "@/lib/shop-i18n";
import { getLang } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

/** 找到集合（含子分类：父分类承载落地页） */
async function findCollection(slug: string) {
  const tree = await listCategoryTree();
  return (
    tree.find((c) => c.slug === slug) ?? tree.find((c) => c.children.some((ch) => ch.slug === slug))
  );
}

/**
 * 集合落地页 —— URL 形态逐字对齐原站 `/collections/<slug>`（实测 200）。
 * 原站 `/products?category=...` 并不存在，本地旧链接由 `/products` 重定向到此。
 */
export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const [cat, lang] = await Promise.all([findCollection(slug), getLang()]);
  const name = cat ? pickName(cat.name, cat.nameEn ?? null, lang) : slug;
  return { title: name };
}

export default async function CollectionPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  // 未知集合按原站口径 404，而不是静默降级成「全部商品」
  const cat = await findCollection(slug);
  if (!cat) notFound();

  return <CollectionListing categorySlug={slug} />;
}
