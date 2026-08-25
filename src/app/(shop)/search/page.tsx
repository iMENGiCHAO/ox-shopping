import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { listProducts } from "@/server/services/product.service";
import { ProductCard } from "@/components/shop/product-card";
import { toCardData } from "@/components/shop/types";
import { getT } from "@/lib/shop-i18n-server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** 官方 Sort by 弹层选项（shop.x.com/search 实测） */
const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price-ascending", label: "Price, low to high" },
  { value: "price-descending", label: "Price, high to low" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

/** Pages tab 检索的静态页面注册表（官方 Pages 结果为 Shopify Pages） */
const SEARCHABLE_PAGES: { title: string; href: string; keywords: string }[] = [
  { title: "FAQs", href: "/pages/faqs", keywords: "faq faqs shipping returns order tracking payment refund pre-order presale" },
  { title: "Accessibility Statement", href: "/pages/accessibility-statement", keywords: "accessibility wcag screen reader disability" },
  { title: "Privacy Policy", href: "/policies/privacy", keywords: "privacy data personal information cookies gdpr" },
  { title: "Terms and Conditions", href: "/policies/terms", keywords: "terms conditions service legal agreement" },
  { title: "Cookie Consent", href: "/policies/cookies", keywords: "cookie consent tracking storage policy" },
];

interface SearchPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const sp = await Promise.resolve(searchParams);
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  if (!q) return { title: "Search", robots: { index: false, follow: true } };

  // 官方 title 格式：Search: N results found for "q"
  const rawSort = typeof sp.sort === "string" ? sp.sort : "";
  const inStock = sp.in_stock === "1";
  const minRaw = typeof sp.price_min === "string" && sp.price_min !== "" ? Number(sp.price_min) : NaN;
  const maxRaw = typeof sp.price_max === "string" && sp.price_max !== "" ? Number(sp.price_max) : NaN;
  try {
    const { total } = await listProducts({
      search: q,
      sort: rawSort === "price-ascending" ? "price_asc" : rawSort === "price-descending" ? "price_desc" : "relevance",
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

/** 官方同款弹层触发按钮 + 面板容器（<details> 无 JS 实现） */
function ToolbarPopover({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group relative h-full">
      <summary className="flex h-full cursor-pointer list-none items-center gap-1.5 px-9 text-[11px] uppercase tracking-[0.08em] text-foreground [&::-webkit-details-marker]:hidden">
        {label}
        <svg
          aria-hidden="true"
          width="10"
          viewBox="0 0 10 10"
          fill="none"
          className="transition-transform group-open:rotate-180"
        >
          <path d="m1 3 4 4 4-4" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
        </svg>
      </summary>
      {children}
    </details>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const t = getT();
  const sp = searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const rawSort = typeof sp.sort === "string" ? sp.sort : "relevance";
  const sort: SortValue = (SORT_OPTIONS.some((o) => o.value === rawSort)
    ? rawSort
    : "relevance") as SortValue;
  const inStock = sp.in_stock === "1";
  const minRaw = typeof sp.price_min === "string" && sp.price_min !== "" ? Number(sp.price_min) : NaN;
  const maxRaw = typeof sp.price_max === "string" && sp.price_max !== "" ? Number(sp.price_max) : NaN;
  const tab = sp.tab === "pages" ? "pages" : "products";

  /* ── 空态：官方为居中 H1(18px) + 搜索框 + 放大镜提交，页面大部分留白 ── */
  if (!q) {
    return (
      <div className="flex flex-col items-center pt-[250px] pb-[240px]">
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
      sort === "relevance"
        ? "relevance"
        : sort === "price-ascending"
          ? "price_asc"
          : "price_desc",
    inStockOnly: inStock,
    minPrice: Number.isFinite(minRaw) ? minRaw : undefined,
    maxPrice: Number.isFinite(maxRaw) ? maxRaw : undefined,
    page: 1,
    pageSize: PAGE_SIZE,
  });

  const ql = q.toLowerCase();
  const matchedPages = SEARCHABLE_PAGES.filter(
    (pg) => pg.title.toLowerCase().includes(ql) || pg.keywords.split(" ").some((k) => k === ql),
  );

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
          {(tab === "pages" ? matchedPages.length : total)}{" "}
          {(tab === "pages" ? matchedPages.length : total) === 1
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
            href={buildSearchUrl(q, { ...commonOverrides, tab: tb === "pages" ? "pages" : undefined })}
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

      {/* 工具行 — 右侧 Filters(移动端) + Sort by 弹层（官方 y320 h54） */}
      <div className="mt-12 flex h-[54px] items-center justify-end gap-8">
        {/* Filters — 官方桌面端隐藏，仅移动端抽屉；此处用弹层等效 */}
        <details className="group relative lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-foreground [&::-webkit-details-marker]:hidden">
            {t("Filters")}
            <svg aria-hidden="true" width="10" viewBox="0 0 10 10" fill="none" className="transition-transform group-open:rotate-180">
              <path d="m1 3 4 4 4-4" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
            </svg>
          </summary>
          <form
            action="/search"
            method="get"
            className="absolute right-0 top-full z-30 w-72 space-y-6 border border-border bg-background p-5 shadow-lg"
          >
            <input type="hidden" name="q" value={q} />
            <input type="hidden" name="sort" value={sort} />
            {tab === "pages" ? <input type="hidden" name="tab" value="pages" /> : null}
            <div>
              <p className="text-[11px] uppercase tracking-[0.08em] text-foreground">{t("Availability")}</p>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  name="in_stock"
                  value="1"
                  defaultChecked={inStock}
                  className="h-3.5 w-3.5 accent-[#1C1C1C]"
                />
                {t("In stock only")}
              </label>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.08em] text-foreground">{t("Price")}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[13px] opacity-70">$</span>
                <input
                  type="number"
                  name="price_min"
                  min="0"
                  defaultValue={typeof sp.price_min === "string" ? sp.price_min : ""}
                  className="h-9 w-full border border-input bg-card px-2 text-sm outline-none focus:border-foreground"
                />
                <span className="text-[13px] opacity-70">{t("to")}</span>
                <span className="text-[13px] opacity-70">$</span>
                <input
                  type="number"
                  name="price_max"
                  min="0"
                  defaultValue={typeof sp.price_max === "string" ? sp.price_max : ""}
                  className="h-9 w-full border border-input bg-card px-2 text-sm outline-none focus:border-foreground"
                />
              </div>
            </div>
            <button
              type="submit"
              className="h-[46px] w-full bg-primary text-[14px] font-normal text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("View results")}
            </button>
          </form>
        </details>

        {/* Sort by — 黑底弹层三项（官方实测 Relevance / Price 升降序） */}
        <ToolbarPopover label={t("Sort by")}>
          <div className="absolute right-0 top-full z-30 w-60 bg-ink p-2 shadow-xl">
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
        </ToolbarPopover>
      </div>

      {/* 内容区 — 官方结构：240px 桌面空侧栏 + 主列（4 列网格，219px 卡 / 60px 列距 / 64px 行距） */}
      <div className="mt-12 flex flex-col gap-10 lg:flex-row lg:gap-[50px]">
        {/* 桌面侧栏占位（官方 facets 桌面收起，仅占位） */}
        <div className="hidden w-[240px] shrink-0 lg:block" aria-hidden />

        <div className="min-w-0 flex-1">
          {tab === "pages" ? (
            matchedPages.length > 0 ? (
              <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 sm:gap-x-3 min-[1400px]:grid-cols-4">
                {matchedPages.map((pg) => (
                  <Link
                    key={pg.href}
                    href={pg.href}
                    className="group block border border-border p-5 transition-colors hover:border-foreground"
                  >
                    <p className="text-[15px] font-normal text-foreground underline-offset-4 group-hover:underline">
                      {pg.title}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-16 text-center text-[15px] text-foreground/70">{t("No results found.")}</p>
            )
          ) : rows.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 sm:gap-x-3 sm:gap-y-16 lg:grid-cols-3 lg:gap-x-[60px] min-[1400px]:grid-cols-4">
              {rows.map((product, i) => (
                <ProductCard key={product.id} product={toCardData(product)} priority={i < 4} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-[15px] text-foreground/70">{t("No results found.")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
