import Link from "next/link";
import Image from "next/image";
import { listCategoryTree, listProducts } from "@/server/services/product.service";
import { getPageBanners, type BannerSlotConfig } from "@/server/services/settings.service";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGrid } from "@/components/shop/product-grid";
import { Reveal } from "@/components/shop/reveal";
import { toCardData } from "@/components/shop/types";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { pickName } from "@/lib/shop-i18n";
import { OFFICIAL_LISTING_EXCLUDE_SLUGS } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const ALL_SIZE = 100;

/**
 * Homepage — faithful shop.x.com replica:
 * two edge-to-edge half-width collection banners ([ Name ] top-left,
 * Shop All bottom-left, slow zoom) → centered "All Products" heading →
 * 3-column product grid.
 */
export default async function HomePage() {
  const [{ rows }, categories, banners] = await Promise.all([
    listProducts({
      sort: "newest",
      page: 1,
      pageSize: ALL_SIZE,
      excludeSlugs: OFFICIAL_LISTING_EXCLUDE_SLUGS,
    }),
    listCategoryTree(),
    getPageBanners(),
  ]);
  const featured = categories.slice(0, 2);

  /* 横幅渲染数据：后台配置优先，未配置回落分类默认（图=分类图、链=分类页、题=分类名） */
  const bannerData = (slot: BannerSlotConfig, index: number) => {
    const cat = featured[index];
    return {
      image: slot.image || cat?.image || `https://picsum.photos/seed/${cat?.slug ?? index}/1200/675`,
      href: slot.href || (cat ? `/products?category=${cat.slug}` : "/products"),
      title: slot.title || (cat ? catName(cat) : ""),
      hasContent: Boolean(cat) || Boolean(slot.image),
    };
  };
  const leftBanner = bannerData(banners.homeLeft, 0);
  const rightBanner = bannerData(banners.homeRight, 1);
  const t = getT();
  const lang = getLang();
  const catName = (c: (typeof featured)[number]) => pickName(c.name, c.nameEn ?? null, lang);

  return (
    <div className="pb-24">
      {/* ── Collections — two half-width banners, no gap ── */}
      {featured.length > 0 || banners.homeLeft.image || banners.homeRight.image ? (
        <section className="grid grid-cols-2">
          {[leftBanner, rightBanner].map((bn, i) =>
            bn.hasContent ? (
              <Link
                key={i}
                href={bn.href}
                className="group relative block aspect-[16/9] overflow-hidden bg-ink sm:aspect-[720/404]"
              >
                <Image
                  src={bn.image}
                  alt={bn.title}
                  fill
                  priority={i === 0}
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover transition-transform duration-[5000ms] ease-out group-hover:scale-[1.06]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/25 to-black/10" />

                {/* [ Name ] — top-left, 22px regular white */}
                <h2 className="absolute left-5 top-5 text-[22px] font-normal leading-tight text-white drop-shadow-sm sm:left-8 sm:top-7">
                  [ {bn.title} ]
                </h2>

                {/* Shop All — bottom-left, outlined white button (x.com exact) */}
                <span className="absolute bottom-5 left-5 inline-flex h-[37px] items-center border border-white px-7 text-[14px] font-normal leading-none text-white transition-colors group-hover:bg-white group-hover:text-ink sm:bottom-8 sm:left-8">
                  {t("Shop All")}
                </span>
              </Link>
            ) : null,
          )}
        </section>
      ) : null}

      {/* ── All products — centered heading + grid ── */}
      <section className="container pt-14">
        <Reveal>
          <h2 className="text-center text-[28px] font-normal leading-tight text-foreground">
            {t("All Products")}
          </h2>
        </Reveal>
        <ProductGrid className="mt-10">
          {rows.map((product, i) => (
            <Reveal key={product.id} delay={(i % 3) * 90}>
              <ProductCard product={toCardData(product)} priority={i < 3} />
            </Reveal>
          ))}
        </ProductGrid>
      </section>
    </div>
  );
}
