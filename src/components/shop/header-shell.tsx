"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * 吸顶导航外壳：
 * - 向下滚动隐藏、向上滚动显示(shop.x.com 式)
 * - 集合页透明顶栏：页面顶部存在 [data-transparent-header] 且未滚动时，
 *   顶栏透明叠在 hero 上；一旦向下滚动即恢复实心黑（官方 is-solid 机制）
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [allowTransparent, setAllowTransparent] = useState(false);
  const lastY = useRef(0);
  const pathname = usePathname();

  // 路由变化时检测页面是否声明了透明顶栏（集合页 hero 带 data-transparent-header）。
  // 动态页内容为流式渲染，hero 可能晚于外壳挂载，用 MutationObserver 捕获。
  useEffect(() => {
    const check = () => setAllowTransparent(!!document.querySelector("[data-transparent-header]"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

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
        data-transparent={allowTransparent && !scrolled ? "true" : "false"}
        className={`sticky top-0 z-40 transition-[transform,box-shadow] duration-300 ease-out motion-reduce:transition-none ${
          hidden ? "-translate-y-full" : "translate-y-0"
        } ${scrolled && !hidden ? "shadow-[0_1px_12px_rgba(0,0,0,0.18)]" : "shadow-none"}`}
      >
        {children}
      </div>
    </>
  );
}
