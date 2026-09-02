"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { useT } from "@/components/shop/lang-provider";
import { useCurrency } from "@/components/shop/currency-provider";
import type { ProductCardData } from "@/components/shop/types";

/**
 * SearchOverlay — shop.x.com 官方同构（实测）：
 * 点击顶栏 Search → 头部下方展开全宽黑色接管面板：
 * - 搜索行 h≈77：放大镜图标 + 无边框输入框（18px 白字，placeholder "Search..."）+ 右侧 16px 关闭按钮
 * - 输入 ≥2 字符后下方出现联想区：左侧 240px 侧栏放 "Suggestions"(12px 白/65) 标题与查询链接，
 *   右侧主列 4 列商品卡片网格（方图 245px + 白色标题/价格），列距 ~24
 * - Enter 提交跳转 /search?q=；Esc / 点击遮罩 / Close 关闭
 */
export function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [results, setResults] = useState<ProductCardData[]>([]);
  const [pageResults, setPageResults] = useState<
    { type: "page" | "faq" | "sizechart"; title: string; href: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const t = useT();
  const { format } = useCurrency();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Predictive search — debounced */
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
          fetch(`/api/products?q=${encodeURIComponent(q)}&pageSize=8&status=ACTIVE`, {
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
            <div
              className="fixed inset-x-0 bottom-0 top-[65px] z-50 bg-black/40"
              role="dialog"
              aria-modal="true"
              aria-label={t("Search")}
              onClick={() => setOpen(false)}
            >
              {/* 内容层：空态透出页面（官方 header-search 无结果时下方透明）；
                  输入 ≥2 字符后整层实心黑（官方 .header-search::part(content) 实心） */}
              <div
                className={`relative flex h-full flex-col overflow-y-auto ${
                  q.length >= 2 ? "bg-black" : "bg-transparent"
                }`}
              >
                {/* 搜索行 — 紧贴 65px 头部下方，h-[77px]，不透明黑底（官方实测 0,0,0） */}
                <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-black">
                  <div className="container flex h-[77px] items-center gap-4">
                    <Search className="h-5 w-5 shrink-0 text-white/65" strokeWidth={1.25} />
                    <input
                      ref={inputRef}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder={t("Search...")}
                      aria-label={t("Search")}
                      autoComplete="off"
                      autoCorrect="off"
                      className="h-full w-full bg-transparent text-[18px] font-normal text-white outline-none placeholder:text-white/40"
                    />
                    {searching ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/50" />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label={t("Close search")}
                      className="shrink-0 p-2 text-white transition-opacity hover:opacity-65"
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

                {/* 联想区 — 左 240px 侧栏（Suggestions + 查询链接）/ 右侧商品网格 */}
                {q.length >= 2 ? (
                  <div className="container flex flex-col gap-10 pb-16 pt-6 lg:flex-row lg:gap-[54px]">
                    <div className="w-full shrink-0 lg:w-[240px]">
                      <p className="text-[12px] font-normal leading-normal text-white/65">
                        {t("Suggestions")}
                      </p>
                      <button
                        type="button"
                        onClick={() => submit()}
                        className="mt-3 block text-left text-[15px] text-white underline-offset-4 hover:underline"
                      >
                        {q}
                      </button>
                      {/* 官方联想含 Pages 结果：静态页面 / FAQ / 商品参数对照表 */}
                      {pageResults.length > 0 ? (
                        <div className="mt-5">
                          <p className="text-[12px] font-normal leading-normal text-white/65">
                            {t("Pages")}
                          </p>
                          <ul className="mt-2 space-y-2">
                            {pageResults.map((pg, i) => (
                              <li key={`${pg.href}-${i}`}>
                                <Link
                                  href={pg.href}
                                  onClick={() => setOpen(false)}
                                  className="block text-[15px] text-white underline-offset-4 hover:underline"
                                >
                                  {pg.title}
                                  {pg.type === "sizechart" ? (
                                    <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-white/45">
                                      {t("Size Charts")}
                                    </span>
                                  ) : null}
                                  {pg.type === "faq" ? (
                                    <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-white/45">
                                      FAQ
                                    </span>
                                  ) : null}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      {results.length > 0 ? (
                        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
                          {results.map((p) => (
                            <Link
                              key={p.id}
                              href={`/products/${p.slug}`}
                              onClick={() => setOpen(false)}
                              className="group block"
                            >
                              <span className="relative block aspect-square overflow-hidden bg-white/[0.06]">
                                <ImageWithFallback
                                  src={firstImage(p)}
                                  alt=""
                                  fill
                                  sizes="(max-width:640px) 45vw, 245px"
                                  className="object-contain p-3"
                                />
                              </span>
                              <span className="mt-3 block truncate text-[15px] text-white">
                                {typeof p.name === "string" ? p.name : JSON.stringify(p.name)}
                              </span>
                              <span className="mt-0.5 block text-[13px] tabular-nums text-white/65">
                                {format(Number(p.price))}
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : searching ? null : (
                        <p className="py-10 text-[15px] text-white/65">{t("No results found.")}</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
