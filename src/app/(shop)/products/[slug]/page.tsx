import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Separator } from "@/components/ui/separator";
import {
  getProductBySlug,
  getRelatedProducts,
  listProducts,
} from "@/server/services/product.service";
import { getSessionUser } from "@/lib/auth/session";
import { formatPrice } from "@/components/shop/currency-server";
import { BuyPanel } from "@/components/shop/buy-panel";
import { Gallery } from "@/components/shop/gallery";
import { ProductCard } from "@/components/shop/product-card";
import { firstImage, parseAttributes, toCardData, toNumberPrice } from "@/components/shop/types";
import { getT } from "@/lib/shop-i18n-server";
import { RelatedCarousel } from "@/components/shop/related-carousel";
import { SizeChartAccordion, getSizeChart } from "@/components/shop/size-chart";
import { getLang as getServerLang } from "@/lib/shop-i18n-server";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { pickName, pickDescription, buildAlternates } from "@/lib/shop-i18n";
import { env, brandFallback } from "@/lib/env";

export const dynamic = "force-dynamic";

interface DetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata(props: DetailPageProps): Promise<Metadata> {
  const params = await props.params;
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const lang = await getServerLang();
  try {
    const product = await getProductBySlug(slug);
    const image = firstImage(product.images);
    const productName = pickName(product.name, product.nameEn, lang);
    const productDesc = pickDescription(product.description ?? "", product.descriptionEn, lang);
    // 品牌名从站点设置取（后台可改），仅在未配置时回落到 brandFallback
    const settings = await getSiteSettings();
    const brand = pickLang(settings.siteName, lang).trim() || brandFallback;
    return {
      title: productName,
      description:
        productDesc?.slice(0, 160) ||
        pickName(`${productName} — ${brand} 官方`, `${productName} — Official ${brand}`, lang),
      alternates: buildAlternates(`/products/${slug}`),
      openGraph: {
        title: productName,
        description: productDesc?.slice(0, 200),
        images: image ? [image] : [],
      },
    };
  } catch {
    // 元数据阶段在响应开始流式输出**之前**执行，此时调用 notFound() 才能让 HTTP 状态
    // 正确置为 404（若拖到页面组件再抛，响应已 flush，只能得到软 404/200）。
    notFound();
  }
}

export default async function ProductDetailPage(props: DetailPageProps) {
  const params = await props.params;
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  // getProductBySlug 对「不存在/已下架」抛 404 ApiError。这里转成 Next 的 notFound()：
  // 必须在组件异步体内直接调用（而不是写在 .catch 回调里抛出），否则 React 会把它当作
  // 「服务端渲染报错」回退到客户端渲染 —— HTTP 状态会是 200 且 404 页面不显示（软 404）。
  const product = await getProductBySlug(slug).catch(() => null);
  if (!product) notFound();
  const t = await getT();
  const lang = await getServerLang();
  const productName = pickName(product.name, product.nameEn, lang);
  const productDesc = pickDescription(product.description ?? "", product.descriptionEn, lang);
  const categoryName = product.category
    ? pickName(product.category.name, product.category.nameEn, lang)
    : "";

  const [user, siteSettings] = await Promise.all([getSessionUser(), getSiteSettings()]);

  // 预售提示文案解析（解耦合 + 数据贯通）：
  //   1) 商品级 presaleNoteZh/En 覆盖（运营为单商品写专属文案）
  //   2) 站级默认 SiteSetting.presaleNote（管理员在"站点设置"配置）
  //   3) 内置兜底：buy-panel 用 t() 提供
  // 当前 lang 缺该语种时回退另一种语种。
  const resolvePresaleNote = (): string | null => {
    if (!product.isPresale) return null;
    const productNote = pickLang(
      { zh: product.presaleNoteZh ?? "", en: product.presaleNoteEn ?? "" },
      lang,
    );
    if (productNote) return productNote;
    return pickLang(siteSettings.presaleNote, lang);
  };
  const presaleNote = resolvePresaleNote();
  // 官方相关推荐共 10 个商品（Shopify recommendations 实测）
  let related = await getRelatedProducts(product.id, product.categoryId, 10);

  // 相关推荐不足 4 个时，用热销商品补位(对齐 上游参考站 的 You may also like)
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
    ? product.images.filter((src: unknown): src is string => typeof src === "string")
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
          // 售罄口径与 spec-stock.ts 对齐：未追踪的规格值（undefined/null/空）视为「可用」，
          // 仅显式 0 或负数视为「售罄」。之前 `Number(stockMap[v]) || 0 <= 0` 会把未追踪值
          // 误判成售罄（NaN→0→≤0），导致「有的售罄标识出现、有的没有」的错乱。
          soldOutValues: values.filter((v) => {
            // 售罄口径与 spec-stock.ts 对齐：仅显式 0/负数视为「售罄」；未追踪(undefined)或
            // 非法值 → Number() 得 NaN → 视为「可用」。之前 `Number(stockMap[v]) || 0 <= 0`
            // 会把未追踪值误判成售罄，导致「有的售罄标识出现、有的没有」的错乱。
            const n = Number(stockMap[v]);
            return Number.isFinite(n) && n <= 0;
          }),
        };
      }
      return { name, values, soldOutValues };
    });
  // 预售商品按预订售卖：不因整件/规格库存为 0 而禁选规格
  const effectiveSelectable = product.isPresale
    ? selectableAttributes.map((g) => ({ ...g, soldOutValues: [] as string[] }))
    : selectableAttributes;
  const price = toNumberPrice(product.price);
  const inStock = product.stock > 0;
  const priceText = await formatPrice(price);
  const compareNum = toNumberPrice(product.compareAtPrice);
  const showCompare = compareNum > price;
  const compareText = showCompare ? await formatPrice(compareNum) : "";
  // 尺码参数表：后台配置优先，未配置时回退官方抓取数据（与官方一致仅部分商品有）
  const dbChart =
    product.sizeChart &&
    typeof product.sizeChart === "object" &&
    "headers" in (product.sizeChart as object)
      ? (product.sizeChart as { headers: string[]; rows: string[][] })
      : null;
  const sizeChart = dbChart ?? getSizeChart(product.slug);
  // 原网站 上游参考站 无 NEW/HOT/Sold out 标签，保持一致 — badges 已移除
  // 商品描述以纯文本保存与渲染(React 自动转义，天然防 XSS)，保留换行
  // 实际展示文本已通过上面的 productDesc + lang 选择

  /* Structured data — Google Merchant / rich results
     币种与站点地址都取运行时配置（env.CURRENCY / env.SITE_URL），
     不写死 "USD" 与 localhost —— 改基准币种或换域名后结构化数据不会失真。 */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    description: productDesc?.slice(0, 300) || undefined,
    image: images.slice(0, 4),
    category: categoryName || undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: env.CURRENCY,
      price: price.toFixed(2),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${env.SITE_URL.replace(/\/$/, "")}/products/${product.slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="shell pdp-shell space-y-14 pb-12 pt-12">
        {/* Main section — 官方 PDP 栅格 7fr / 80px / 3fr（见 .pdp-grid）
            断点用 min-[1000px] 而不是 lg:(1024px)：原站 PDP 的两栏断点是 1000px，
            实测见 globals.css 的 .pdp-grid 注释与 历史取证（取证脚本已移除） */}
        <div className="pdp-grid">
          <div className="pdp-media flex flex-col min-[1000px]:col-start-1 min-[1000px]:row-start-1">
            {/* 大图画廊 + 官方位置：Size Chart 参数表在大图下方（后台配置了的商品才显示） */}
            <Gallery images={images} alt={productName} />
          </div>

          <div className="flex flex-col gap-4 min-[1000px]:sticky min-[1000px]:top-24 min-[1000px]:col-start-2 min-[1000px]:row-start-1 min-[1000px]:self-start">
            <h1 className="text-[length:var(--pdp-title-size)] font-normal leading-normal tracking-[0.01em] text-foreground">
              {productName}
            </h1>

            {/* Price — small regular, right under title; 官方 Sale price：现价 + 划线原价，价格灰色 */}
            <div className="flex items-baseline gap-2.5">
              <span className="text-[15px] text-foreground/60">{priceText}</span>
              {showCompare ? (
                <span className="text-[14px] text-foreground/40 line-through">{compareText}</span>
              ) : null}
            </div>

            {/* 官方 separator：价格与介绍之间 1px #DDD 分割线（间距由列 gap 提供） */}
            <Separator />

            {/* Buy panel — spec swatches/selects, description, quantity, CTAs
                （售罄时由官方按钮位统一展示 Notify me，不再重复顶部订阅入口） */}
            <BuyPanel
              productId={product.id}
              stock={product.stock}
              isPresale={product.isPresale}
              presaleNote={presaleNote}
              defaultEmail={user?.email ?? undefined}
              productName={productName}
              selectableAttributes={effectiveSelectable}
              descriptionSlot={
                productDesc ? (
                  <div className="desc-prose">
                    {productDesc
                      .split(/\n\s*\n|\n/)
                      .map((para) => para.trim())
                      .filter(Boolean)
                      .map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                  </div>
                ) : null
              }
            />
          </div>

          {/* Size Chart：桌面位于左列大图下方；移动端位于购买按钮之后（官方 DOM 顺序） */}
          {sizeChart ? (
            <div className="min-[1000px]:col-start-1 min-[1000px]:row-start-2">
              <SizeChartAccordion chart={sizeChart} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Related recommendations — 上游参考站 横向滑动轮播（一屏 4 张，左右箭头，可滑动浏览更多） */}
      {related.length > 0 ? (
        <section className="border-t border-border pb-12 pt-12 min-[1000px]:pt-14">
          <h2 className="mb-12 text-center text-[28px] font-normal leading-tight text-foreground">
            {t("You may also like")}
          </h2>
          {/* 官方轮播容器留白 48px（实测 1440→卡 291px / 1680→351 / 1920→411，拟合 p=48,g=60） */}
          <div className="shell">
            <RelatedCarousel>
              {related.map((prod) => (
                <ProductCard key={prod.id} product={toCardData(prod)} />
              ))}
            </RelatedCarousel>
          </div>
        </section>
      ) : null}
    </>
  );
}
