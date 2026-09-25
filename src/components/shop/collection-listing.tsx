import { listCategoryTree, listProducts } from "@/server/services/product.service";
import { pickName } from "@/lib/shop-i18n";
import { getLang } from "@/lib/shop-i18n-server";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGrid } from "@/components/shop/product-grid";
import { toCardData } from "@/components/shop/types";
import { cn } from "@/lib/utils";
import { OFFICIAL_LISTING_EXCLUDE_SLUGS } from "@/lib/catalog";

/**
 * 集合商品列表 —— 上游参考站 collection 落地页同构。
 *
 * 原站形态（Playwright 实测）：`/collections/<slug>` 顶部是全宽 hero 大横幅
 * （图内无文字），下方商品网格；单页全部展示，**无分页 / 筛选 / 排序**。
 *
 * 由 `/collections/[slug]` 与旧链接 `/products?category=<slug>` 共用。
 */
export async function CollectionListing({ categorySlug }: { categorySlug: string }) {
  const [categories, { rows }] = await Promise.all([
    listCategoryTree(),
    listProducts({
      categorySlug: categorySlug || undefined,
      sort: "title",
      page: 1,
      pageSize: 100,
      excludeSlugs: OFFICIAL_LISTING_EXCLUDE_SLUGS,
    }),
  ]);

  // 支持子分类：父分类 = 商品所属落地页（父分类 banner 展示）
  const currentCategory =
    categories.find((c) => c.slug === categorySlug) ??
    categories.find((c) => c.children.some((child) => child.slug === categorySlug));

  const lang = await getLang();
  const catLabel = (c: { name: string; nameEn?: string | null }) =>
    pickName(c.name, c.nameEn ?? null, lang);

  /**
   * 分类落地页大横幅：**只认 `bannerImage`（横图）**。
   *
   * 原站实测（2026-09-20，1440 视口）：
   *   · `/collections/x-collection`（上传了横图）→ **没有任何 h1**，只有图；
   *   · `/collections/mens`（没上传横图）→ **h1 = "Mens"**，居中显示分类名。
   * 也就是说「有没有名字」取决于**横图**，与列表卡片图（`image`）无关。
   * 此前写成 `bannerImage || image` 回落：只有卡片图的分类也会渲染大横幅并把分类名吃掉，
   * 与大爷指出的原站行为不符（大爷 2026-09-20 反馈）。
   */
  const heroImage = currentCategory?.bannerImage || "";

  return (
    <div className="pb-16">
      {/* 原站实测（2026-09-20，1440 视口）：集合页横幅**不从顶栏下方钻上去**——
          页头 0..65、横幅 65..477。此前用 `collection-hero-under-header`
          （margin-top: -header-h）+ data-transparent-header 把横幅上提 65px，
          导致横幅与整片商品卡整体比原站高 65px。 */}
      {heroImage ? (
        <section className="relative aspect-[3.49/1] max-h-[560px] min-h-[220px] w-full overflow-hidden bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImage}
            alt={currentCategory ? catLabel(currentCategory) : "Collection"}
            className="h-full w-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
          {/* 原网站 上游参考站 分类内页横幅无任何文字，只有图片，保持一致 */}
        </section>
      ) : null}

      {/* 无图时保持居中标题 */}
      {!heroImage ? (
        <section className="pt-[var(--plp-head-pt)] text-center">
          <div className="shell plp-shell">
            <h1 className="text-[length:var(--plp-title-size)] font-normal leading-tight text-foreground">
              {currentCategory ? catLabel(currentCategory) : "Products"}
            </h1>
          </div>
        </section>
      ) : null}

      {/* 横幅底 → 首行卡片顶：原站实测 48px（477→525），此前 40px */}
      <div className={cn("shell plp-shell", heroImage ? "mt-12" : "mt-[var(--plp-head-gap)]")}>
        <ProductGrid>
          {rows.map((product, i) => (
            <ProductCard key={product.id} product={toCardData(product)} priority={i < 3} />
          ))}
        </ProductGrid>
      </div>
    </div>
  );
}
