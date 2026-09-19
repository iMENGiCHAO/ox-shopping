import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { listProducts } from "@/server/services/product.service";
import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/shop/product-card";
import { toCardData } from "@/components/shop/types";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { buildAlternates } from "@/lib/shop-i18n";
import { cn } from "@/lib/utils";
import { matchSearchablePages } from "@/lib/searchable-pages";
import { searchSizeChartProducts } from "@/server/services/chart-search";
import { SearchSidebarFilters } from "@/components/shop/search-sidebar-filters";
import { SearchSortSelect } from "@/components/shop/search-sort-select";

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

function buildSearchUrl(q: string, overrides: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined && v !== "") params.set(k, v);
  }
  const s = params.toString();
  return s ? `/search?${s}` : "/search";
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

  /* ── 空态：官方为居中 H1(18px) + 搜索框 + 放大镜提交，页面大部分留白 ──
     原站实测（O-search.png，1216 布局）：H1 字形 y272..284、输入框 y309..356（300×48），
     页脚深色带自 y557 起 ⇒ 区块上下内边距各 200px（200 + 标题 25 + 20 + 输入 48 + 200 = 492）。 */
  if (!q) {
    return (
      <div className="flex flex-col items-center pb-[200px] pt-[200px]">
        <div className="w-[300px] text-center">
          <h1 className="text-[18px] font-normal leading-snug text-foreground">{t("Search")}</h1>
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

  const commonOverrides = {
    sort: sort !== "relevance" ? sort : undefined,
    in_stock: inStock ? "1" : undefined,
    price_min: typeof sp.price_min === "string" ? sp.price_min : undefined,
    price_max: typeof sp.price_max === "string" ? sp.price_max : undefined,
  };

  return (
    <div className="w-full px-5 pb-16 lg:px-12">
      {/* 标题区 — H1 28px 居中 + 计数行（官方 y129/y184） */}
      <section className="pt-16 text-center">
        <h1 className="text-[28px] font-normal leading-tight text-foreground">{t("Search")}</h1>
        <p className="mt-4 text-[15px] font-normal text-foreground">
          {total} {total === 1 ? t("result for") : t("results for")} &quot;{q}&quot;
        </p>
      </section>

      {/* 原站实测（2026-09-20 /search?q=faq）：**不是 tab**，而是一页两区块 ——
          先「Products」（含 Sort by 工具行与商品网格），再「Pages」（页面结果）。 */}
      <h2 className="mt-[53px] text-center text-[18px] font-normal leading-snug text-foreground">
        {t("Products")}
      </h2>

      {/* 工具行 — 原站实测（REF-search-1200.png，1200 视口）：
          上下各一条**贯通整幅**的 1px 分隔线（y317 / y372，线色 rgb(221,221,221)），
          `Sort by` 居中其内（带高 55px = 53 + 上下边框），右对齐。
          分隔线是真·出血（x 0..1199），故用负外边距抵消外层 padding。 */}
      <div className="-mx-5 mt-[36px] border-y border-border lg:-mx-12">
        {/* 分隔线整幅出血（靠负外边距抵消外层 padding），但 Sort by 本身要回到容器内边距内，
            否则会贴到视口最右缘（原站 chevron 右缘 = 1168 = 内容右缘）。 */}
        <div className="flex h-[53px] items-center justify-end px-5 lg:px-12">
          <SearchSortSelect />
        </div>
      </div>

      {/* 内容区 — shop.x.com 桌面结构：240px 左侧筛选栏 + 主列（商品网格） */}
      <div className="mt-12 flex flex-col gap-10 lg:flex-row lg:gap-[50px]">
        {/* 桌面左侧筛选栏：Availability + Price 手风琴（原站实测**默认折叠**） */}
        <SearchSidebarFilters />

        <div className="min-w-0 flex-1">
          {rows.length > 0 ? (
            <div className="plp-grid">
              {/* 复用 `.plp-grid` 令牌（列距 48 / 行距 66），与 PLP 同源。
                  原站实测（REF-search-1200.png）：3 列卡片 245px、列距 48px、
                  行 pitch 374px（图高 245 + 卡片信息 62.8 + 行距 66）。
                  此前写死 `lg:gap-x-[60px]`，列距比原站宽 12px。 */}
              {rows.map((product, i) => (
                <ProductCard key={product.id} product={toCardData(product)} priority={i < 4} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-[15px] text-foreground/70">
              {t("No results found.")}
            </p>
          )}

          {/* Pages 区块：静态页面 / FAQ / 商品参数对照表（原站同页第二段） */}
          {matchedPages.length > 0 || faqHits.length > 0 || chartHits.length > 0 ? (
            <section className="mt-20 border-t border-border pt-12">
              <h2 className="text-[18px] font-normal leading-snug text-foreground">{t("Pages")}</h2>
              <div className="mt-6">
                <div className="space-y-10">
                  {chartHits.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-foreground/60">
                        {t("Size Charts")}
                      </p>
                      <div className="divide-y divide-border border border-border">
                        {chartHits.map((c) => (
                          <Link
                            key={c.slug}
                            href={`/products/${c.slug}`}
                            className="group flex items-center justify-between px-5 py-4 transition-colors hover:bg-accent"
                          >
                            <span className="text-[15px] text-foreground underline-offset-4 group-hover:underline">
                              {c.name}
                            </span>
                            <span className="text-[11px] uppercase tracking-[0.08em] text-foreground/50">
                              {t("Size Charts")}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {faqHits.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-foreground/60">
                        {t("FAQs")}
                      </p>
                      <div className="divide-y divide-border border border-border">
                        {faqHits.map((f) => (
                          <Link
                            key={f.question}
                            href="/pages/faqs"
                            className="group block px-5 py-4 transition-colors hover:bg-accent"
                          >
                            <p className="text-[15px] text-foreground underline-offset-4 group-hover:underline">
                              {f.question}
                            </p>
                            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-foreground/65">
                              {f.answer}
                            </p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {matchedPages.length > 0 ? (
                    <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 sm:gap-x-3 min-[1400px]:grid-cols-4">
                      {matchedPages.map((pg) => (
                        <Link
                          key={pg.href}
                          href={pg.href}
                          className="group block border border-border p-5 transition-colors hover:border-foreground"
                        >
                          <p className="text-[15px] font-normal text-foreground underline-offset-4 group-hover:underline">
                            {lang === "zh" ? pg.titleZh : pg.title}
                          </p>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
