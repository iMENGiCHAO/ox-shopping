import Link from "next/link";
import Image from "next/image";
import { safeJsonLd } from "@/lib/utils";
import { listCategoryTree, listProducts } from "@/server/services/product.service";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGrid } from "@/components/shop/product-grid";
import { Reveal } from "@/components/shop/reveal";
import { toCardData } from "@/components/shop/types";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { pickName } from "@/lib/shop-i18n";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { env, brandFallback } from "@/lib/env";
import { OFFICIAL_LISTING_EXCLUDE_SLUGS } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const ALL_SIZE = 100;

/**
 * Homepage — faithful 上游参考站 replica:
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
  /* 首页横幅只取显式标记了 homeSortOrder 的集合，按其值排序后取前两块。
     不能用「前两个分类」—— /collections 的陈列顺序是
     `Mens · Ox Essentials Collection · Womens · Ox Collection`，
     而原站首页横幅是 `[ Ox Collection ]` + `[ Ox Essentials Collection ]`，两者顺序不同。 */
  const featured = categories
    .filter((c) => c.homeSortOrder != null)
    .sort((a, b) => (a.homeSortOrder ?? 0) - (b.homeSortOrder ?? 0))
    .slice(0, 2);

  const t = await getT();
  const lang = await getLang();
  // 结构化数据用真实站点配置，避免硬编码站名/域名污染 SEO/GEO
  const settings = await getSiteSettings();
  const orgName = pickLang(settings.siteName, lang).trim() || brandFallback;
  const siteUrl = env.SITE_URL.replace(/\/$/, "");
  const logoSrc = settings.siteLogoUrl || "/images/brand/favicon.png";
  // 提前声明：bannerData 在初始化时就需要 catName，必须在 bannerData 之前完成。
  const catName = (c: (typeof featured)[number]) => pickName(c.name, c.nameEn ?? null, lang);

  /* 首页横幅：由前两个分类驱动（管理端在「分类」里编辑，无独立横幅入口）
     - 图：始终使用分类图片 image（首页横幅不使用大横幅 bannerImage，避免上传大横幅后覆盖首页显示）
     - 链：分类页 / 题：分类名 */
  const bannerData = (index: number) => {
    const cat = featured[index];
    return {
      // 缺图时置 null：渲染层跳过 <Image>，横幅退为深色底（bg-ink）+ 渐变 +
      // 文案 —— 绝不用外链随机图冒充分类图（picsum 占位曾可漏到生产首页）。
      image: cat?.image || null,
      href: cat ? `/products?category=${cat.slug}` : "/products",
      title: cat ? catName(cat) : "",
      hasContent: Boolean(cat),
    };
  };
  const leftBanner = bannerData(0);
  const rightBanner = bannerData(1);

  return (
    <div className="pb-24">
      {/* 视觉隐藏的 h1：首页无可见标题（顶部为分类横幅），但搜索引擎需一个 h1 承载站名；不改变任何可见样式 */}
      <h1 className="sr-only">{orgName}</h1>
      {/* ── Collections — two half-width banners, no gap ── */}
      {featured.length > 0 ? (
        <section className="grid grid-cols-2">
          {[leftBanner, rightBanner].map((bn, i) =>
            bn.hasContent ? (
              <Link
                key={i}
                href={bn.href}
                className="group relative block aspect-[8/7] overflow-hidden bg-ink min-[700px]:aspect-[720/404]"
              >
                {bn.image ? (
                <Image
                  src={bn.image}
                  alt={bn.title}
                  fill
                  priority={i === 0}
                  sizes="(max-width: 640px) 100vw, 50vw"
                  // 用 arbitrary property（[transition-duration:…]）而不是 duration 的方括号
                  // 任意值写法：后者在 Tailwind 里是歧义类名（transition-duration 与
                  // animation-duration 都可能匹配），构建时告警且不保证生成预期 CSS。
                  // `/collections` 早已用规范写法，这里与之统一。
                  // 注：Tailwind 会扫描注释，故本注释刻意不写完整的类名字面量。
                  className="object-cover transition-transform ease-out [transition-duration:5000ms] group-hover:scale-[1.06]"
                />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/25 to-black/10" />

                {/* [ Name ] + Shop All — 左上角纵向排列：分类名称在上、按钮在名称下方，与原网站一致。
                    实测基准（原站 1200 视口截图 B-vp1200.png，y 轴 1:1 未裁切）：
                      header 高 65 → 横幅顶 y=65
                      `[ Ox Collection ]` 字形带 y 119..134（h=16 → 22px 字号），x 从 50
                      `Shop All` 按钮盒 y 169..214（h=46），x 48..156（宽 108）
                    → 文案容器距横幅顶 49px、名称与按钮间距 27.5px。
                    此前写 `sm:top-7`(28px) + `gap-6`(24px)，实测整体偏高 19~24px，已校正。 */}
                <div className="absolute left-5 top-5 flex flex-col items-start gap-6 sm:left-12 sm:top-[49px] sm:gap-[27.5px]">
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

      {/* ── All products — centered heading + static product grid (上游参考站 首页为静态网格，非轮播) ── */}
      <section className="pt-[var(--home-head-pt)]">
        <Reveal>
          <h2 className="text-center text-[length:var(--home-title-size)] font-normal leading-tight text-foreground">
            {t("All Products")}
          </h2>
        </Reveal>
        <div className="shell plp-shell mt-[var(--home-grid-mt)]">
          {/* 空态（前台体验审计 P0）：新库/清库后此前是「All Products 标题 + 全空白」 */}
          {rows.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              {t("No products available yet. Please check back soon.")}
            </p>
          ) : (
            <ProductGrid variant="home">
              {rows.map((product, i) => (
                <ProductCard key={product.id} product={toCardData(product)} priority={i < 3} />
              ))}
            </ProductGrid>
          )}
        </div>
      </section>

      {/* Organization + WebSite JSON-LD — 提升 Google 搜索品牌认知 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd([
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
