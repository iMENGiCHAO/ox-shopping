import Link from "next/link";
import Image from "next/image";
import { listCategoryTree, listProducts } from "@/server/services/product.service";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGrid } from "@/components/shop/product-grid";
import { Reveal } from "@/components/shop/reveal";
import { toCardData } from "@/components/shop/types";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { pickName } from "@/lib/shop-i18n";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
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
  const [{ rows }, categories] = await Promise.all([
    listProducts({
      sort: "newest",
      page: 1,
      pageSize: ALL_SIZE,
      excludeSlugs: OFFICIAL_LISTING_EXCLUDE_SLUGS,
    }),
    listCategoryTree(),
  ]);
  const featured = categories.slice(0, 2);

  const t = await getT();
  const lang = await getLang();
  // 结构化数据用真实站点配置，避免硬编码站名/域名污染 SEO/GEO
  const settings = await getSiteSettings();
  const orgName = pickLang(settings.siteName, lang) || "Ox Shopping";
  const siteUrl =
    (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const logoSrc = settings.siteLogoUrl || "/images/brand/favicon.png";
  // 提前声明：bannerData 在初始化时就需要 catName，必须在 bannerData 之前完成。
  const catName = (c: (typeof featured)[number]) => pickName(c.name, c.nameEn ?? null, lang);

  /* 首页横幅：由前两个分类驱动（管理端在「分类」里编辑，无独立横幅入口）
     - 图：分类落地页大横幅 bannerImage 优先，回落分类卡片图
     - 链：分类页 / 题：分类名 */
  const bannerData = (index: number) => {
    const cat = featured[index];
    return {
      image:
        cat?.bannerImage ||
        cat?.image ||
        `https://picsum.photos/seed/${cat?.slug ?? index}/1200/675`,
      href: cat ? `/products?category=${cat.slug}` : "/products",
      title: cat ? catName(cat) : "",
      hasContent: Boolean(cat),
    };
  };
  const leftBanner = bannerData(0);
  const rightBanner = bannerData(1);

  return (
    <div className="pb-24">
      {/* ── Collections — two half-width banners, no gap ── */}
      {featured.length > 0 ? (
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
                  className="duration-[5000ms] object-cover transition-transform ease-out group-hover:scale-[1.06]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/25 to-black/10" />

                {/* [ Name ] + Shop All — 左上角纵向排列：名字在上、按钮在名字下方 24px。
                    左缘与 header LOGO 左缘对齐：
                    移动 20px（header padding 20px）/ 桌面 48px（header padding 48px） */}
                <div className="absolute left-5 top-5 flex flex-col items-start gap-6 sm:left-12 sm:top-7">
                  <h2 className="text-[22px] font-normal leading-tight text-white drop-shadow-sm">
                    [ {bn.title} ]
                  </h2>
                  <span className="inline-flex h-[46px] items-center border border-white px-7 text-[14px] font-normal leading-none text-white transition-colors group-hover:bg-white group-hover:text-ink">
                    {t("Shop All")}
                  </span>
                </div>
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

      {/* Organization + WebSite JSON-LD — 提升 Google 搜索品牌认知 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: orgName,
              url: siteUrl,
              logo: `${siteUrl}${logoSrc}`,
            },
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: orgName,
              url: siteUrl,
              potentialAction: {
                "@type": "SearchAction",
                target: `${siteUrl}/products?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            },
          ]),
        }}
      />
    </div>
  );
}
