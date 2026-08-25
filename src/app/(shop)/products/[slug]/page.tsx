import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Separator } from "@/components/ui/separator";
import {
  getProductBySlug,
  getRatingStats,
  getRelatedProducts,
  listProducts,
} from "@/server/services/product.service";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/components/shop/currency-server";
import { BuyPanel } from "@/components/shop/buy-panel";
import { Gallery } from "@/components/shop/gallery";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGrid } from "@/components/shop/product-grid";
import { SectionTitle } from "@/components/shop/section-title";
import { firstImage, parseAttributes, toCardData, toNumberPrice } from "@/components/shop/types";
import { getT } from "@/lib/shop-i18n-server";
import { RelatedCarousel } from "@/components/shop/related-carousel";
import { SizeChartAccordion, getSizeChart } from "@/components/shop/size-chart";
import { getLang as getServerLang } from "@/lib/shop-i18n-server";
import { pickName, pickDescription } from "@/lib/shop-i18n";

export const dynamic = "force-dynamic";

interface DetailPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: DetailPageProps): Promise<Metadata> {
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const lang = getServerLang();
  try {
    const product = await getProductBySlug(slug);
    const image = firstImage(product.images);
    const productName = pickName(product.name, product.nameEn, lang);
    const productDesc = pickDescription(product.description ?? "", product.descriptionEn, lang);
    return {
      title: productName,
      description: productDesc?.slice(0, 160) || `${productName} — Official SpaceXAI Shop`,
      openGraph: {
        title: productName,
        description: productDesc?.slice(0, 200),
        images: image ? [image] : [],
      },
    };
  } catch {
    return { title: "Product not found" };
  }
}

export default async function ProductDetailPage({ params }: DetailPageProps) {
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const product = await getProductBySlug(slug).catch(() => notFound());
  const t = getT();
  const lang = getServerLang();
  const productName = pickName(product.name, product.nameEn, lang);
  const productDesc = pickDescription(product.description ?? "", product.descriptionEn, lang);
  const categoryName = product.category
    ? pickName(product.category.name, product.category.nameEn, lang)
    : "";

  const [stats, user] = await Promise.all([
    getRatingStats(product.id),
    getSessionUser(),
  ]);
  // 官方相关推荐共 10 个商品（Shopify recommendations 实测）
  let related = await getRelatedProducts(product.id, product.categoryId, 10);

  // 相关推荐不足 4 个时，用热销商品补位(对齐 shop.x.com 的 You may also like)
  if (related.length < 4) {
    const extra = await listProducts({
      page: 1,
      pageSize: 10 - related.length,
      sort: "sales",
    });
    const exclude = new Set([product.id, ...related.map((r) => r.id)]);
    related = [...related, ...extra.rows.filter((r) => !exclude.has(r.id))];
  }

  const images = Array.isArray(product.images)
    ? product.images.filter((src): src is string => typeof src === "string")
    : [];
  const attributes = parseAttributes(product.attributes);
  // 规格级库存（后台逐尺寸维护）：0 = 该规格售罄，驱动前台禁用+划线
  const specStockRaw =
    product.specStock && typeof product.specStock === "object"
      ? (product.specStock as Record<string, Record<string, number>>)
      : null;
  const selectableAttributes = attributes
    .filter((a) => a.selectable === true)
    .map(({ name, values, soldOutValues }) => {
      const stockMap = specStockRaw?.[name];
      if (stockMap && Object.keys(stockMap).length > 0) {
        return {
          name,
          values,
          soldOutValues: values.filter((v) => (Number(stockMap[v]) || 0) <= 0),
        };
      }
      return { name, values, soldOutValues };
    });
  // 预售商品按预订售卖：不因整件/规格库存为 0 而禁选规格
  const effectiveSelectable = product.isPresale
    ? selectableAttributes.map((g) => ({ ...g, soldOutValues: [] as string[] }))
    : selectableAttributes;
  const infoAttributes = attributes.filter((a) => a.selectable !== true);
  const price = toNumberPrice(product.price);
  const inStock = product.stock > 0;
  const priceText = await formatPrice(price);
  const compareNum = toNumberPrice(product.compareAtPrice);
  const showCompare = compareNum > price;
  const compareText = showCompare ? await formatPrice(compareNum) : "";
  const costNum = toNumberPrice(product.costPrice);
  const costText = costNum > 0 ? await formatPrice(costNum) : "";
  // 尺码参数表：后台配置优先，未配置时回退官方抓取数据（与官方一致仅部分商品有）
  const dbChart =
    product.sizeChart && typeof product.sizeChart === "object" && "headers" in (product.sizeChart as object)
      ? (product.sizeChart as { headers: string[]; rows: string[][] })
      : null;
  const sizeChart = dbChart ?? getSizeChart(product.slug);
  const badges: string[] = [];
  if (!inStock) badges.push(product.isPresale ? t("Pre-order") : t("Sold out"));
  else {
    if ((product.isNew ?? false) && !badges.includes(t("New"))) badges.push(t("New"));
    if (product.isHot ?? false) badges.push(t("Hot"));
  }
  // 商品描述以纯文本保存与渲染(React 自动转义，天然防 XSS)，保留换行
  // 实际展示文本已通过上面的 productDesc + lang 选择

  /* Structured data — Google Merchant / rich results */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    description: productDesc?.slice(0, 300) || undefined,
    image: images.slice(0, 4),
    category: categoryName || undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: price.toFixed(2),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${process.env.SITE_URL || "http://localhost:3000"}/products/${product.slug}`,
    },
    ...(stats.total > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: stats.average.toFixed(1),
            reviewCount: stats.total,
          },
        }
      : {}),
  };

  return (
    <>
    <div className="container space-y-14 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Main section — 65/35 editorial split (official: no breadcrumb) */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_354px] lg:gap-x-20">
        <div className="flex flex-col">
          {/* 大图画廊 + 官方位置：Size Chart 参数表在大图下方（后台配置了的商品才显示） */}
          <Gallery
            images={images}
            alt={productName}
            badges={
              badges.length > 0 ? (
                <>
                  {badges.map((b) => (
                    <span
                      key={b}
                      className="bg-[#EFEFEF] px-2 py-0.5 text-[11px] uppercase leading-[18px] tracking-normal text-black/65"
                    >
                      {b}
                    </span>
                  ))}
                </>
              ) : undefined
            }
          />
          {sizeChart ? (
            <div className="mt-10 lg:mt-14">
              <SizeChartAccordion chart={sizeChart} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          <h1 className="text-[22px] font-normal leading-snug tracking-[0.01em] text-foreground">
            {productName}
          </h1>

          {/* Price — small regular, right under title; 官方 Sale price：现价 + 划线原价 */}
          <div className="flex items-baseline gap-2.5">
            <span className="text-[15px] text-foreground">{priceText}</span>
            {showCompare ? (
              <span className="text-[14px] text-foreground/50 line-through">{compareText}</span>
            ) : null}
          </div>
          {/* 成本价 — 后台填写才显示 */}
          {costNum > 0 ? (
            <p className="text-[12px] text-foreground/50">
              {t("Cost")}: {costText}
            </p>
          ) : null}

          {/* Buy panel — spec swatches/selects, description, quantity, CTAs */}
          <BuyPanel
            productId={product.id}
            stock={product.stock}
            isPresale={product.isPresale}
            defaultEmail={user?.email ?? undefined}
            productName={productName}
            selectableAttributes={effectiveSelectable}
            descriptionSlot={
              productDesc ? (
                <div className="mt-6 space-y-4 text-[13px] leading-relaxed text-foreground/80">
                  {productDesc
                    .split("\n")
                    .filter(Boolean)
                    .map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                </div>
              ) : null
            }
          />
        </div>
      </div>

    </div>

    {/* Related recommendations — 官方为全幅出血布局（仅页边距、无容器上限），随窗口缩放恒整数张 */}
    {related.length > 0 ? (
      <section className="mt-12 pb-12 lg:mt-14">
        <h2 className="mb-12 text-center text-[28px] font-normal leading-tight text-foreground">
          {t("You may also like")}
        </h2>
        <div className="w-full px-5 lg:px-[60px]"><RelatedCarousel>
          {related.map((prod) => (
            <ProductCard key={prod.id} product={toCardData(prod)} className="w-[calc(50%-10px)] shrink-0 md:w-[calc(33.333%-13.34px)] lg:w-[calc(25%-45px)]" />
          ))}
        </RelatedCarousel></div>
      </section>
    ) : null}
    </>
  );
}


