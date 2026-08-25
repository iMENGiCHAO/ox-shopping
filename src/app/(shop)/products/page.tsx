import { listCategoryTree, listProducts } from "@/server/services/product.service";
import { pickName } from "@/lib/shop-i18n";
import { getLang } from "@/lib/shop-i18n-server";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGrid } from "@/components/shop/product-grid";
import { toCardData } from "@/components/shop/types";
import { cn } from "@/lib/utils";
import { OFFICIAL_LISTING_EXCLUDE_SLUGS } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * Products listing — faithful shop.x.com replica:
 * optional full-width collection hero banner ([ Name ] overlay) when a
 * category is selected, otherwise a plain centered white heading, then a
 * borderless product grid showing every product. No filters, no sorting,
 * no pagination — exactly like the live store.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const sp = searchParams;
  const category = typeof sp.category === "string" ? sp.category.trim() : "";

  const [categories, { rows }] = await Promise.all([
    listCategoryTree(),
    // 官方 /collections/all：标题字母序、排除未陈列商品、单页全部展示
    listProducts({
      categorySlug: category || undefined,
      sort: "title",
      page: 1,
      pageSize: 100,
      excludeSlugs: OFFICIAL_LISTING_EXCLUDE_SLUGS,
    }),
  ]);

  // Unknown slugs degrade to "all products"
  const categoryIsValid =
    !!category &&
    (categories.some((c) => c.slug === category) ||
      categories.some((c) => c.children.some((child) => child.slug === category)));
  const currentCategory = categoryIsValid
    ? (categories.find((c) => c.slug === category) ??
      categories.find((c) => c.children.some((child) => child.slug === category)))
    : undefined;

  const lang = getLang();
  const catLabel = (c: { name: string; nameEn?: string | null }) =>
    pickName(c.name, c.nameEn ?? null, lang);

  return (
    <div className="pb-16">
      {/* Collection hero — full-width dark banner when a collection is selected.
          优先使用分类专属落地页大横幅(bannerImage),未设置时回落列表卡片图。 */}
      {currentCategory?.bannerImage || currentCategory?.image ? (
        <section className="relative aspect-[3.49/1] min-h-[220px] w-full overflow-hidden bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentCategory.bannerImage || currentCategory.image || ""}
            alt={catLabel(currentCategory)}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
          <h1 className="absolute bottom-6 left-6 text-[22px] font-normal text-white sm:bottom-10 sm:left-10 sm:text-[28px]">
            [ {catLabel(currentCategory)} ]
          </h1>
        </section>
      ) : null}

      {/* Plain white heading for the unfiltered catalog (x.com /collections/all) */}
      {!currentCategory?.bannerImage && !currentCategory?.image ? (
        <section className={cn("pb-2 pt-12 text-center")}>
          <div className="container">
            <h1 className="text-[28px] font-normal leading-tight text-foreground">
              {currentCategory ? catLabel(currentCategory) : "Products"}
            </h1>
          </div>
        </section>
      ) : null}

      <div className="container mt-10">
        <ProductGrid>
          {rows.map((product, i) => (
            <ProductCard key={product.id} product={toCardData(product)} priority={i < 3} />
          ))}
        </ProductGrid>
      </div>
    </div>
  );
}
