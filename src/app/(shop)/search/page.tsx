import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { listProducts } from "@/server/services/product.service";
import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/shop/product-card";
import { toCardData } from "@/components/shop/types";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { cn } from "@/lib/utils";
import { matchSearchablePages } from "@/lib/searchable-pages";
import { searchSizeChartProducts } from "@/server/services/chart-search";
import { SearchPopover } from "@/components/shop/search-popover";

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
  if (!q) return { title: "Search", robots: { index: false, follow: true } };

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
    };
  } catch {
    return { title: `Search results for "${q}"`, robots: { index: false, follow: true } };
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
  const tab = sp.tab === "pages" ? "pages" : "products";

  /* ── 空态：官方为居中 H1(18px) + 搜索框 + 放大镜提交，页面大部分留白 ── */
  if (!q) {
    return (
      <div className="flex flex-col items-center pb-[240px] pt-[250px]">
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
                className="h-12 w-full border border-border bg-card px-3 pr-11 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
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
    <div className="container pb-16">
      {/* 标题区 — H1 28px 居中 + 计数行（官方 y129/y184） */}
      <section className="pt-16 text-center">
        <h1 className="text-[28px] font-normal leading-tight text-foreground">{t("Search")}</h1>
        <p className="mt-4 text-[15px] font-normal text-foreground">
          {tab === "pages" ? matchedPages.length + faqHits.length + chartHits.length : total}{" "}
          {(tab === "pages" ? matchedPages.length + faqHits.length + chartHits.length : total) === 1
            ? t("result for")
            : t("results for")}{" "}
          &quot;{q}&quot;
        </p>
      </section>

      {/* Products / Pages 双 Tab（官方 x-tabs：居中、激活项黑色下划线，y257） */}
      <div className="mt-12 flex items-center justify-center gap-8">
        {(["products", "pages"] as const).map((tb) => (
          <Link
            key={tb}
            href={buildSearchUrl(q, {
              ...commonOverrides,
              tab: tb === "pages" ? "pages" : undefined,
            })}
            className={cn(
              "border-b pb-2 text-[12px] leading-none transition-colors",
              tab === tb
                ? "border-foreground font-normal text-foreground"
                : "border-transparent text-foreground/60 hover:text-foreground",
            )}
          >
            {tb === "products" ? t("Products") : t("Pages")}
          </Link>
        ))}
      </div>

      {/* 工具行 — 左 Availability 弹出菜单 · 右 Sort by（官方同构：Filter 左 / Sort by 右） */}
      <div className="mt-12 flex h-[54px] items-center justify-between gap-8">
        {/* Availability — 左侧菜单，弹层向右展开不露边（与 Sort by 同款交互） */}
        <SearchPopover label={t("Availability")} align="left">
          <div className="mt-0 w-60 border border-border bg-background p-2 shadow-xl">
            <Link
              href={buildSearchUrl(q, {
                ...commonOverrides,
                in_stock: inStock ? undefined : "1",
                tab: tab === "pages" ? "pages" : undefined,
              })}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 text-[15px] transition-colors hover:bg-accent",
                inStock ? "text-foreground" : "text-foreground/65",
              )}
            >
              {t("In stock only")}
              {inStock ? <span aria-hidden="true">✓</span> : null}
            </Link>
          </div>
        </SearchPopover>

        {/* Sort by — 可关闭展开按钮（官方 Relevance / Price 升降序） */}
        <SearchPopover label={t("Sort by")} align="right">
          <div className="mt-0 w-60 bg-ink p-2 shadow-xl">
            {SORT_OPTIONS.map((o) => (
              <Link
                key={o.value}
                href={buildSearchUrl(q, {
                  ...commonOverrides,
                  sort: o.value === "relevance" ? undefined : o.value,
                })}
                className={cn(
                  "block px-3 py-2.5 text-[15px] transition-colors hover:bg-white/10",
                  sort === o.value ? "text-white" : "text-white/65",
                )}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </SearchPopover>
      </div>

      {/* 内容区 — 官方结构：240px 桌面空侧栏 + 主列（4 列网格，219px 卡 / 60px 列距 / 64px 行距） */}
      <div className="mt-12 flex flex-col gap-10 lg:flex-row lg:gap-[50px]">
        {/* 桌面侧栏占位（官方 facets 桌面收起，仅占位） */}
        <div className="hidden w-[240px] shrink-0 lg:block" aria-hidden />

        <div className="min-w-0 flex-1">
          {tab === "pages" ? (
            matchedPages.length > 0 || faqHits.length > 0 || chartHits.length > 0 ? (
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
            ) : (
              <p className="py-16 text-center text-[15px] text-foreground/70">
                {t("No results found.")}
              </p>
            )
          ) : rows.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-3 sm:gap-y-16 lg:grid-cols-3 lg:gap-x-[60px] min-[1400px]:grid-cols-4">
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
    </div>
  );
}
