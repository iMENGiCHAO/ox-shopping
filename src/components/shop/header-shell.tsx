"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** 吸顶导航外壳：向下滚动隐藏、向上滚动显示(shop.x.com 式) */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      setScrolled(y > 10);
      // 上滑(-2px)立即显出、下滑(>6px 且过 120px)隐藏 —— 收展干脆利落
      if (y > 120 && delta > 6) {
        setHidden(true);
      } else if (delta < -2 || y <= 120) {
        setHidden(false);
      }
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* 收起态：鼠标移到视口顶栏区域即显现（shop.x.com 式 hover-reveal） */}
      {hidden ? (
        <div
          aria-hidden
          className="fixed inset-x-0 top-0 z-50 h-4"
          onMouseEnter={() => setHidden(false)}
        />
      ) : null}
      <div
        data-testid="header-shell"
        data-hidden={hidden ? "true" : "false"}
        className={`sticky top-0 z-40 transition-[transform,box-shadow] duration-300 ease-out motion-reduce:transition-none ${
          hidden ? "-translate-y-full" : "translate-y-0"
        } ${scrolled && !hidden ? "shadow-[0_1px_12px_rgba(0,0,0,0.18)]" : "shadow-none"}`}
      >
        {children}
      </div>
    </>
  );
}
