"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { SearchTabButton } from "@/components/shop/search-tab-button";
import { useT } from "@/components/shop/lang-provider";
import { useCurrency } from "@/components/shop/currency-provider";
import type { ProductCardData } from "@/components/shop/types";

/**
 * SearchOverlay —— 页头联想面板，**逐项对齐原站实测**。
 *
 * 取证方式（2026-09-20）：Playwright 直连 上游参考站，1216×900 / deviceScaleFactor 1，
 * 点开页头搜索并输入查询后量取几何与像素。所有尺寸见 globals.css 的 `--search-*` 令牌。
 *
 * ── 空态（查询 < 2 字符）─────────────────────────────────────────────
 * 面板**只有一条搜索行**（高 76，紧贴 65px 页头下沿），下方是页面本身、**不加任何遮罩**。
 * 实测：打开面板前后扫描整个文档，都没有大面积半透明覆盖层。
 * ⚠️ 此前本组件在空态渲染了两条 `[ Ox Collection ] Shop All` 入口 —— 那是**误读**：
 * 那两条其实是首页 hero 横幅（就在面板透明区后面透出来），原站面板里没有它们。
 *
 * ── 搜索行 ─────────────────────────────────────────────────────────
 * `grid-template-columns: 20px 1fr 16px`，列间距 20，容器左右内边距 48；
 * 输入框高 28、字号 17.64px（原站 input 的计算字号）。
 *
 * ── 结果态 ─────────────────────────────────────────────────────────
 * 面板黑色区域**随内容高度**（不是铺满视口）：
 * - 左栏 250px：`Suggestions`（12px / 白 65%）
 * - 栏距 40px，右栏顶部是 `Products` / `Pages` 两个 tab（12px 白字、下内边距 10px，
 *   激活项用 `box-shadow: 0 1px 0 #fff` 作下划线）
 * - tab 行下方 1px 分隔线 `rgb(38,38,38)`：**左右两栏各一段**，在 40px 栏距处断开
 * - Products：4 列网格，卡片图 189×189（底色 rgb(217,217,217) = `bg-ground`），
 *   标题与价格均 12px 且**居中**；网格下方**居中**一个白底黑字按钮 `View all results`
 * - Pages：圆点列表，15px 白字，行距 37px，**没有** `View all results`
 *
 * 未复刻项：原站左栏 `Suggestions` 下方还有一个查询词 `mark`，
 * 实测其计算样式是 `color: rgb(0,0,0)` 且无背景 —— 即**黑字黑底、实际不可见**
 * （像素采样 (52,231) 为纯黑确认）。渲染一个不可见元素没有意义，故本地不渲染，
 * 视觉效果与原站一致。
 */
export function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [results, setResults] = useState<ProductCardData[]>([]);
  const [pageResults, setPageResults] = useState<
    { type: "page" | "faq" | "sizechart"; title: string; href: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  /** 原站 tab：Products / Pages。默认 Products。 */
  const [tab, setTab] = useState<"products" | "pages">("products");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const t = useT();
  const { format } = useCurrency();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    document.body.style.overflow = "hidden";
    // 搜索面板展开时顶栏强制实心黑（集合页顶部顶栏本为透明，
    // 否则会出现"上方菜单栏透明、只有搜索行黑色"的观感 bug）
    document.body.classList.add("search-open");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("search-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Predictive search — debounced。原站面板只展示 4 个商品（实测），故 pageSize=4。 */
  useEffect(() => {
    if (!open) return;
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setPageResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const [prodRes, pageRes] = await Promise.all([
          fetch(`/api/products?q=${encodeURIComponent(q)}&pageSize=4&status=ACTIVE`, {
            signal: ctrl.signal,
          }),
          fetch(`/api/search/pages?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }),
        ]);
        if (prodRes.ok) {
          const json = await prodRes.json();
          setResults(Array.isArray(json.data) ? json.data : []);
        }
        if (pageRes.ok) {
          const json = await pageRes.json();
          setPageResults(Array.isArray(json.data?.pages) ? json.data.pages : []);
        }
      } catch {
        /* aborted or offline */
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value, open]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = value.trim();
    setOpen(false);
    // 官方行为：提交进入 /search?q= 独立搜索结果页
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  const firstImage = (p: ProductCardData) =>
    Array.isArray(p.images) && p.images[0] ? p.images[0] : undefined;

  const q = value.trim();
  // 挂载后才有 document —— 面板通过 Portal 渲染到 body，避免被 header 层叠上下文拦截
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs opacity-65 transition-opacity hover:opacity-100"
        aria-label={t("Search products")}
      >
        <Search className="header-search-icon" />
        <span className="hidden sm:inline">{t("Search")}</span>
      </button>

      {open && mounted
        ? createPortal(
            <>
              {/* 点击面板外关闭用的**透明**层。原站没有可见遮罩（实测无半透明覆盖层），
                  所以这里必须保持透明 —— 加 bg-black/40 会与原站不一致。 */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
              {/* 面板：黑色区域随内容高度，不铺满视口 */}
              <div
                className="fixed inset-x-0 top-[var(--header-h)] z-50 bg-black"
                role="dialog"
                aria-modal="true"
                aria-label={t("Search")}
              >
                {/* 搜索行 — grid 20 / 1fr / 16，列间距 20，行高 76 */}
                <form onSubmit={submit} className="shell">
                  <div className="grid h-[var(--search-row-h)] grid-cols-[20px_1fr_16px] items-center gap-x-[var(--search-icon-gap)]">
                    <Search className="h-5 w-5 text-white/65" strokeWidth={1.25} />
                    <div className="relative">
                      <input
                        ref={inputRef}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={t("Search...")}
                        aria-label={t("Search")}
                        autoComplete="off"
                        autoCorrect="off"
                        className="h-[var(--search-input-h)] w-full bg-transparent text-[length:var(--search-input-fs)] font-normal text-white outline-none placeholder:text-white/40"
                      />
                      {/* 加载指示：**绝对定位**，不参与 grid 列宽计算，
                          以免破坏 20/1fr/16 三段式 */}
                      {searching ? (
                        <Loader2 className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/50" />
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label={t("Close search")}
                      className="relative h-4 w-4 text-white transition-opacity after:absolute after:-inset-2 after:content-[''] hover:opacity-65"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.25" />
                      </svg>
                    </button>
                  </div>
                </form>

                {/* 结果区 —— 查询 < 2 字符时不渲染任何内容（原站空态只有搜索行）
                    两栏栅格：左栏 250（Suggestions）＋ 栏距 40 ＋ 右栏。
                    ⚠️ tabpanel 必须落在**右栏**（`col-start-2`）：原站的商品网格与
                    Pages 列表都在右栏（x=338 起、宽 830），因此 4 列卡片各 189px、
                    `View all results` 也居中于右栏（x=677）。
                    此前把 tabpanel 放在整幅宽度，导致卡片变成 262px、
                    按钮居中到 534 —— 两处都因此错位。 */}
                {q.length >= 2 ? (
                  <div className="shell pb-12">
                    <div className="grid grid-cols-1 gap-x-[var(--search-col-gap)] min-[700px]:grid-cols-[var(--search-sidebar-w)_1fr]">
                      <p className="border-b border-[var(--search-divider)] pb-[var(--search-tab-pad-b)] pt-6 text-[12px] leading-5 text-white/65">
                        {t("Suggestions")}
                      </p>
                      <div
                        className="flex gap-x-[var(--search-tab-gap)] border-b border-[var(--search-divider)] pt-6"
                        role="tablist"
                        aria-label={t("Search")}
                      >
                        <SearchTabButton
                          active={tab === "products"}
                          tone="on-dark"
                          onClick={() => setTab("products")}
                        >
                          {t("Products")}
                        </SearchTabButton>
                        <SearchTabButton
                          active={tab === "pages"}
                          tone="on-dark"
                          onClick={() => setTab("pages")}
                        >
                          {t("Pages")}
                        </SearchTabButton>
                      </div>

                      {tab === "products" ? (
                        <div className="col-start-2 pt-[var(--search-panel-top)]" role="tabpanel">
                          {results.length > 0 ? (
                            <>
                              <div className="grid grid-cols-4 gap-x-[var(--search-grid-gap)]">
                                {results.map((p) => (
                                  <Link
                                    key={p.id}
                                    href={`/products/${p.slug}`}
                                    onClick={() => setOpen(false)}
                                    className="group block text-center"
                                  >
                                    <span className="relative block aspect-square overflow-hidden bg-ground">
                                      <ImageWithFallback
                                        src={firstImage(p)}
                                        alt=""
                                        fill
                                        sizes="189px"
                                        className="object-cover"
                                      />
                                    </span>
                                    <span className="mt-[var(--search-card-title-mt)] block truncate text-[12px] leading-5 text-white">
                                      {typeof p.name === "string" ? p.name : JSON.stringify(p.name)}
                                    </span>
                                    <span className="mt-[var(--search-card-price-mt)] block text-[12px] leading-[21px] text-white/65">
                                      {format(Number(p.price))}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                              {/* View all results —— 居中于右栏的白底黑字按钮（原站实测 151×46） */}
                              <div className="mt-[var(--search-btn-mt)] text-center">
                                <Link
                                  href={`/search?q=${encodeURIComponent(q)}&type=product`}
                                  onClick={() => setOpen(false)}
                                  className="inline-flex h-[var(--search-btn-h)] items-center bg-white px-[var(--search-btn-pad-x)] text-[14px] text-black transition-opacity hover:opacity-85"
                                >
                                  {t("View all results")}
                                </Link>
                              </div>
                            </>
                          ) : searching ? null : (
                            <p className="text-[15px] text-white/65">{t("No results found.")}</p>
                          )}
                        </div>
                      ) : (
                        /* Pages tab：圆点列表 15px、行距 37（行高 17 + 间距 20），无按钮 */
                        <ul
                          role="tabpanel"
                          className="col-start-2 mt-0 list-disc pl-[var(--search-pages-indent)] pt-[var(--search-panel-top)] text-[15px] leading-[17px] text-white"
                        >
                          {pageResults.map((pg, i) => (
                            <li
                              key={`${pg.href}-${i}`}
                              className={i > 0 ? "mt-[var(--search-pages-gap)]" : ""}
                            >
                              <Link
                                href={pg.href}
                                onClick={() => setOpen(false)}
                                className="underline-offset-4 hover:underline"
                              >
                                {pg.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
