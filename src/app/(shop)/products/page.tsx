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
 *  - URL ?category=... → 分类落地页：顶部全宽 hero 大横幅（透明顶栏叠图 +
 *    [ Name ] 左下角标题），与官方 collection 落地页一致
 *  - URL 无 ?category → 居中 "Products" 标题（x.com /collections/all）
 *  - 单页全部展示，无分页 / 筛选 / 排序，与官方一致
 */
export default async function ProductsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
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

  // Unknown slugs degrade to "all products"（保持 URL 不报 404）
  const categoryIsValid =
    !!category &&
    (categories.some((c) => c.slug === category) ||
      categories.some((c) => c.children.some((child) => child.slug === category)));
  // 支持子分类：父分类 = 商品所属落地页（父分类 banner 展示）
  const currentCategory = categoryIsValid
    ? (categories.find((c) => c.slug === category) ??
      categories.find((c) => c.children.some((child) => child.slug === category)))
    : undefined;

  const lang = await getLang();
  const catLabel = (c: { name: string; nameEn?: string | null }) =>
    pickName(c.name, c.nameEn ?? null, lang);

  // 分类落地页大横幅：优先 Category.bannerImage（后台横幅管理页「落地页大横幅」入口），
  // 未设置时回落列表卡片图 image。
  const heroImage = currentCategory?.bannerImage || currentCategory?.image || "";

  return (
    <div className="pb-16">
      {/* ── 分类落地页 hero（shop.x.com collection 页同构）────────────────
          透明顶栏叠在 hero 上（HeaderShell data-transparent 机制），
          滚动后顶栏恢复实心黑；[ Name ] 左下角对齐官方样式。 */}
      {heroImage ? (
        <section
          data-transparent-header
          className="collection-hero-under-header relative aspect-[3.49/1] max-h-[560px] min-h-[220px] w-full overflow-hidden bg-ink"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImage}
            alt={currentCategory ? catLabel(currentCategory) : "Collection"}
            className="h-full w-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
          <h1 className="absolute bottom-6 left-6 text-[22px] font-normal leading-tight text-white drop-shadow-sm sm:bottom-10 sm:left-10 sm:text-[28px]">
            {currentCategory ? `[ ${catLabel(currentCategory)} ]` : ""}
          </h1>
        </section>
      ) : null}

      {/* 无图时保持居中标题（全部商品页 / 未配置 banner 的分类） */}
      {!heroImage ? (
        <section className="pb-2 pt-12 text-center">
          <div className="container">
            <h1 className="text-[28px] font-normal leading-tight text-foreground">
              {currentCategory ? catLabel(currentCategory) : "Products"}
            </h1>
          </div>
        </section>
      ) : null}

      <div className={cn("container", heroImage ? "mt-10" : "mt-10")}>
        <ProductGrid>
          {rows.map((product, i) => (
            <ProductCard key={product.id} product={toCardData(product)} priority={i < 3} />
          ))}
        </ProductGrid>
      </div>
    </div>
  );
}
