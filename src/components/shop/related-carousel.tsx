"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 官方同款 "You may also like" 轮播（shop.x.com 实测）：
 * - 卡宽 = 容器百分比：一屏恒为整数张（lg 4 张 / md 3 张 / 小屏 2 张），随窗口缩放无半截卡
 *   （官方实测 1280→260px / 1440→291px / 1680→351px / 1920→411px，同为 4 整数张）
 * - 列距 lg 60px；箭头白底圆钮 44×44 内缩 24px 垂直居中，禁用侧隐藏
 */
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

  const scrollPage = (dir: number) =>
    trackRef.current?.scrollBy({ left: dir * trackRef.current.clientWidth, behavior: "smooth" });

  const arrowCls =
    "absolute z-[2] flex h-11 w-11 items-center justify-center rounded-full bg-white text-foreground transition-opacity duration-200";

  return (
    <div className="relative">
      <div
        ref={trackRef}
        data-testid="related-track"
        onScroll={update}
        className="flex gap-5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:gap-[60px]"
      >
        {children}
      </div>
      {/* 官方 prev-next-button：白圆钮、内缩 24px、垂直居中于图区 */}
      <button
        type="button"
        aria-label="Previous"
        onClick={() => scrollPage(-1)}
        className={`${arrowCls} left-6 top-[calc(50%-25px)] ${canL ? "" : "pointer-events-none invisible opacity-0"}`}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={() => scrollPage(1)}
        className={`${arrowCls} right-6 top-[calc(50%-25px)] ${canR ? "" : "pointer-events-none invisible opacity-0"}`}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
