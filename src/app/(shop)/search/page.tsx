import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { listProducts } from "@/server/services/product.service";
import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/shop/product-card";
import { toCardData } from "@/components/shop/types";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { buildAlternates } from "@/lib/shop-i18n";
import { matchSearchablePages } from "@/lib/searchable-pages";
import { searchSizeChartProducts } from "@/server/services/chart-search";
import { SearchSidebarFilters } from "@/components/shop/search-sidebar-filters";
import { SearchSortSelect } from "@/components/shop/search-sort-select";
import { SearchFilterDrawer } from "@/components/shop/search-filter-drawer";
import { SearchResultTabs } from "@/components/shop/search-result-tabs";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** 官方 Sort by 弹层选项（shop.x.com/search 实测） */
const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price-ascending", label: "Price, low to high" },
  { value: "price-descending", label: "Price, high to low" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: SearchPageProps): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const sp = await Promise.resolve(searchParams);
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const searchPath = q ? `/search?q=${encodeURIComponent(q)}` : "/search";
  if (!q)
    return {
      title: "Search",
      robots: { index: false, follow: true },
      alternates: buildAlternates(searchPath),
    };

  // 官方 title 格式：Search: N results found for "q"
  const rawSort = typeof sp.sort === "string" ? sp.sort : "";
  const inStock = sp.in_stock === "1";
  const minRaw =
    typeof sp.price_min === "string" && sp.price_min !== "" ? Number(sp.price_min) : NaN;
  const maxRaw =
    typeof sp.price_max === "string" && sp.price_max !== "" ? Number(sp.price_max) : NaN;
  try {
    const { total } = await listProducts({
      search: q,
      sort:
        rawSort === "price-ascending"
          ? "price_asc"
          : rawSort === "price-descending"
            ? "price_desc"
            : "relevance",
      inStockOnly: inStock,
      minPrice: Number.isFinite(minRaw) ? minRaw : undefined,
      maxPrice: Number.isFinite(maxRaw) ? maxRaw : undefined,
      page: 1,
      pageSize: 1,
    });
    return {
      title: `Search: ${total} ${total === 1 ? "result" : "results"} found for "${q}"`,
      robots: { index: false, follow: true },
      alternates: buildAlternates(searchPath),
    };
  } catch {
    return {
      title: `Search results for "${q}"`,
      robots: { index: false, follow: true },
      alternates: buildAlternates(searchPath),
    };
  }
}

export default async function SearchPage(props: SearchPageProps) {
  const searchParams = await props.searchParams;
  const t = await getT();
  const lang = await getLang();
  const sp = searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const rawSort = typeof sp.sort === "string" ? sp.sort : "relevance";
  const sort: SortValue = (
    SORT_OPTIONS.some((o) => o.value === rawSort) ? rawSort : "relevance"
  ) as SortValue;
  const inStock = sp.in_stock === "1";
  const minRaw =
    typeof sp.price_min === "string" && sp.price_min !== "" ? Number(sp.price_min) : NaN;
  const maxRaw =
    typeof sp.price_max === "string" && sp.price_max !== "" ? Number(sp.price_max) : NaN;

  /* ── 空态：官方为居中 H1 + 搜索框 + 放大镜提交，页面大部分留白 ──
     原站实测（O-search.png，1216 布局）：H1 字形 y272..284、输入框 y309..356（300×48），
     页脚深色带自 y557 起 ⇒ 区块上下内边距各 200px（200 + 标题 25 + 20 + 输入 48 + 200 = 492）。
     移动端（375）是**另一套**：H1 墨迹 y165..175（宽 49 ⇒ 约 16px）、输入框 y214..228、
     页脚顶 341 ⇒ 上下各约 100px。两套值走 `--search-empty-*` 令牌，见 globals.css。 */
  if (!q) {
    return (
      <div className="search-empty flex flex-col items-center">
        <div className="w-[300px] text-center">
          <h1 className="search-empty-title font-normal leading-snug text-foreground">{t("Search")}</h1>
          <form action="/search" method="get" role="search" className="mt-5 text-left">
            <div className="relative">
              <label htmlFor="search-page-input" className="sr-only">
                {t("Search")}
              </label>
              <input
                id="search-page-input"
                type="text"
                name="q"
                autoComplete="off"
                autoCorrect="off"
                placeholder={t("Search...")}
                className="h-12 w-full border border-border bg-card px-3 pr-11 text-[15px] text-foreground placeholder:text-foreground focus:border-foreground focus:outline-none"
              />
              <button
                type="submit"
                aria-label={t("Search")}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-foreground/65 transition-colors hover:text-foreground"
              >
                <SearchIcon className="h-5 w-5" strokeWidth={1} />
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ── 结果态 ── */
  const { rows, total } = await listProducts({
    search: q,
    sort:
      sort === "relevance" ? "relevance" : sort === "price-ascending" ? "price_asc" : "price_desc",
    inStockOnly: inStock,
    minPrice: Number.isFinite(minRaw) ? minRaw : undefined,
    maxPrice: Number.isFinite(maxRaw) ? maxRaw : undefined,
    page: 1,
    pageSize: PAGE_SIZE,
  });

  // 页面命中：标题(中/英)子串 或 关键词(中/英)子串
  const matchedPages = matchSearchablePages(q);

  // FAQ 内容命中（后台可维护的真实页面内容）：问题或答案包含关键词
  let faqHits: { question: string; answer: string }[] = [];
  try {
    faqHits = await prisma.faq.findMany({
      where: {
        published: true,
        OR: [
          { question: { contains: q, mode: "insensitive" } },
          { answer: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [{ sortOrder: "asc" }],
      take: 6,
      select: { question: true, answer: true },
    });
  } catch {
    /* DB 故障时 Pages 结果退化为静态注册表 */
  }

  // 商品参数对照表（Size Chart）命中：官方 Pages 结果包含商品的 Size Chart
  let chartHits: { slug: string; name: string }[] = [];
  try {
    chartHits = await searchSizeChartProducts(q);
  } catch {
    /* DB 故障时忽略 */
  }

  return (
    <div className="w-full px-[var(--search-page-pad)] pb-16">
      {/* 标题区 — 原站实测：H1 字号是**流式**的（375 → 20px，1216 → 26.5639px），
          上内边距同样响应式（<1000 → 40px，≥1000 → 64px）。
          见 globals.css 的 `--page-title-size` / `--page-title-pt`。 */}
      <section className="pt-[var(--page-title-pt)] text-center">
        <h1 className="text-[length:var(--page-title-size)] font-normal leading-[37px] text-foreground">
          {t("Search")}
        </h1>
        <p className="mt-4 text-[15px] font-normal leading-[25px] text-foreground">
          {total} {total === 1 ? t("result for") : t("results for")} &quot;{q}&quot;
        </p>
      </section>

      {/* Products / Pages —— 原站是**居中 tab**。
          实测（2026-09-20，Playwright 直连原站，1216×900/dsf1）：
          `button.h6` 12px、`Products` x=532 / `Pages` x=650（间距 70）、组宽 152、中心 608；
          tab 行 y=255..285，激活项深色下划线，组下方一条 rgb(221,221,221) 细线只跨组宽。
          ⚠️ 此前这里的注释写「不是 tab，而是一页两区块」，并据此把 `Products` 做成
          居中 18px 的 `<h2>`、把 `Pages` 结果放到页面底部 —— 那个判断是错的，已按实测改回 tab。 */}
      <SearchResultTabs
        products={
          <>
            {/* 工具行 — 原站 `collection-toolbar full-bleed` 实测：
                整幅、**sticky**、白底、高 **54**，上下各一条贯通整幅的 1px 线
                `rgb(221,221,221)`（1216 下位于 y=317 / y=372）。
                ≥1000px：只有 `Sort by`（11px、`padding: 18px 46px`），右缘贴视口右缘、无左分隔线。
                <1000px：`Sort by` + `Filter` 两个单元格，各带一条左分隔线（900 实测：
                组宽 265、`Sort by` 147 + `Filter` 117）。
                分隔线是真·出血（x 0..1215），故用负外边距抵消外层 padding。 */}
            <div className="-mx-[var(--search-page-pad)] mt-[32px]">
              {/* 高度用 `h-[54px]` + `border-y`（border-box）⇒ 总高正好 54，
                  与原站一致（此前只给内层定高，总高变成 56，会把下方整体推低 2px）。 */}
              <div className="sticky top-[var(--header-h)] z-30 h-[var(--search-toolbar-h)] border-y border-border bg-background">
                <div className="flex h-full items-stretch justify-end">
                  <div className="flex items-stretch border-l border-border min-[1000px]:border-l-0">
                    <SearchSortSelect />
                  </div>
                  <SearchFilterDrawer />
                </div>
              </div>
            </div>

            {/* 内容区 — 原站：240px 左侧筛选栏 + 主列（商品网格）。
                实测侧栏 `form.facets` x=48 y=420 w=240；网格 `product-list` x=338 w=830
                ⇒ 栏距 = 338 − (48+240) = **50**。
                ⚠️ 侧栏断点是 **1000px**，不是 Tailwind 的 `lg`(1024)：
                二分实测 999px 时网格 x=32（无侧栏）且 `Filter` 按钮可见（宽 116），
                1000px 时网格 x=320（侧栏出现，x=48 w=240）且 `Filter` 按钮消失。
                与 PDP 的断点是同一套 700/1000 体系。 */}
            <div className="mt-12 flex flex-col gap-10 min-[1000px]:flex-row min-[1000px]:gap-[50px]">
              {/* 桌面左侧筛选栏：Availability + Price 手风琴（原站实测**默认折叠**） */}
              <SearchSidebarFilters />

              <div className="min-w-0 flex-1">
                {rows.length > 0 ? (
                  <div className="plp-grid search-grid">
                    {/* 列数/断点复用 `.plp-grid`（3 列，≥700px），但**间距换成搜索页的实测值**
                        （`.search-grid` → `--search-result-col-gap/row-gap`）：
                        原站 `product-list` 在主列 830 宽下是 3 列 **244.656px**、列距 **48**、行距 **64**，
                        卡片 245×309（图 245×245 + 文字 64）。
                        ⚠️ 不能直接改 `.plp-grid` 的 60px —— 那是集合页（卡 408 / pitch 468）的实测值。 */}
                    {rows.map((product, i) => (
                      <ProductCard key={product.id} product={toCardData(product)} priority={i < 4} />
                    ))}
                  </div>
                ) : (
                  <p className="py-16 text-center text-[15px] text-foreground/70">
                    {t("No results found.")}
                  </p>
                )}
              </div>
            </div>
          </>
        }
        pages={
          /* Pages tab — 原站是**圆点列表**（仅标题链接），不是卡片、也没有分组小标题。
             本地把 Size Chart / 静态页面 / FAQ 三类命中合并进同一个列表：
             保留原有数据来源与检索能力，只对齐呈现形态（与原站一致）。 */
          <ul className="mt-[32px] list-disc pl-5 text-[15px] leading-[17px] text-foreground [&>li+li]:mt-[var(--search-pages-gap)]">
            {chartHits.map((c) => (
              <li key={`chart-${c.slug}`}>
                <Link href={`/products/${c.slug}`} className="underline-offset-4 hover:underline">
                  {c.name}
                </Link>
              </li>
            ))}
            {matchedPages.map((pg) => (
              <li key={pg.href}>
                <Link href={pg.href} className="underline-offset-4 hover:underline">
                  {lang === "zh" ? pg.titleZh : pg.title}
                </Link>
              </li>
            ))}
            {faqHits.map((f) => (
              <li key={f.question}>
                <Link href="/pages/faqs" className="underline-offset-4 hover:underline">
                  {f.question}
                </Link>
              </li>
            ))}
          </ul>
        }
      />
    </div>
  );
}
