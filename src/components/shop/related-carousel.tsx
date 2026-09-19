"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 官方同款 "You may also like" 轮播（shop.x.com 实测）：
 * - 每张卡包一层定宽容器，宽度 = calc((容器宽 - 列距×(N-1)) / N)：
 *   小屏 2 张（gap-5=20px → 50%-10px）/ md 3 张（33.333%-13.34px）/ lg 4 张（gap 60px → 25%-45px）。
 *   任何视口宽度下一屏恒为整数张，绝不露半截（露一点）。
 * - 翻页步长 = clientWidth + 列距：一屏 N 张时 clientWidth = N×卡宽 + (N-1)×列距，
 *   N×(卡宽+列距) = clientWidth + 列距 —— 精确落在下一页第一张卡左缘，
 *   向后/向前翻页展示效果一致（无错位半张）。
 * - 箭头白底圆钮 44×44 内缩 24px 垂直居中，禁用侧隐藏。
 */
const CARD_CLS = "w-[calc(50%-10px)] shrink-0 md:w-[calc(33.333%-13.34px)] lg:w-[calc(25%-45px)]";

export function RelatedCarousel({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);

  const update = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanL(el.scrollLeft > 2);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const scrollPage = (dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    // 一页步长 = clientWidth + 列距（整页 = N 张卡 + N 个列距）
    const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
    el.scrollBy({ left: dir * (el.clientWidth + gap), behavior: "smooth" });
  };

  const arrowCls =
    "absolute z-[2] flex h-11 w-11 items-center justify-center rounded-full bg-white text-foreground shadow-md transition-opacity duration-200 hover:bg-gray-50";

  return (
    <div className="group relative">
      <div
        ref={trackRef}
        data-testid="related-track"
        onScroll={update}
        className="flex gap-5 overflow-x-auto scroll-smooth [scrollbar-width:none] lg:gap-[60px] [&::-webkit-scrollbar]:hidden"
      >
        {Children.map(children, (child) => (
          <div className={CARD_CLS}>{child}</div>
        ))}
      </div>
      {/* 官方 prev-next-button：白圆钮、内缩 24px、垂直居中于图区
          默认隐藏，hover 时显示（与 shop.x.com floating-controls-container--on-hover 一致）
          不能滚动时完全隐藏（不显示变灰箭头） */}
      {canL && (
        <button
          type="button"
          aria-label="Previous"
          onClick={() => scrollPage(-1)}
          className={`${arrowCls} left-6 top-[calc(50%-25px)] opacity-0 group-hover:opacity-100`}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
      )}
      {canR && (
        <button
          type="button"
          aria-label="Next"
          onClick={() => scrollPage(1)}
          className={`${arrowCls} right-6 top-[calc(50%-25px)] opacity-0 group-hover:opacity-100`}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
