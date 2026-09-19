"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Reveal — fade-up on first scroll into view (shop.x.com section reveal).
 * Pure IntersectionObserver + CSS transition; respects prefers-reduced-motion
 * via the global stylesheet override.
 *
 * **渐进增强（重要）**：服务端渲染与首帧一律**可见**。只有客户端在挂载后确认
 * 元素位于首屏之外时，才把它收起并等待进入视口播放入场动画。
 *
 * 此前是反过来的：SSR 直接输出 `translate-y-4 opacity-0`，靠 useEffect 里的
 * 观察器把它改回可见。后果是「内容可见性依赖 JS」——脚本被禁用、加载失败或
 * 加载缓慢时，首页唯一的可见标题（All Products）会**永久隐形**；开发环境下
 * 若客户端包尚未编译完成就访问，也会复现同样的隐形（已实测到）。
 * 元素在首屏内时直接可见、不播动画，也避免了首屏内容出现无谓的入场延迟。
 */

/** 进入判定留白：元素露出视口下缘 40px 以上才算「进入」，与原实现一致 */
const REVEAL_MARGIN_PX = 40;
/** 元素露出 12% 才触发，与原实现一致 */
const REVEAL_THRESHOLD = 0.12;

/**
 * useLayoutEffect 在服务端会告警，故 SSR 阶段退化为 useEffect。
 * 用 layout effect 是为了让「收起」发生在浏览器绘制之前 —— 否则首屏外的
 * 元素会先可见地闪一下再收起。
 */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms */
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  /* idle  = 尚未判定（SSR / 首帧）→ 可见
     hidden = 已确认在首屏之外 → 收起，等待入场
     shown = 已入场 → 可见 */
  const [phase, setPhase] = useState<"idle" | "hidden" | "shown">("idle");

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 不支持 IntersectionObserver 时保持可见，绝不隐藏内容
    if (typeof IntersectionObserver === "undefined") return;

    const rect = el.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    // 已在视口内（或已滚过）→ 直接可见。首屏内容不做入场动画。
    if (rect.top < viewportH - REVEAL_MARGIN_PX) return;

    setPhase("hidden");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPhase("shown");
          io.disconnect();
        }
      },
      { threshold: REVEAL_THRESHOLD, rootMargin: `0px 0px -${REVEAL_MARGIN_PX}px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Comp = Tag as unknown as React.ComponentType<{
    ref?: React.RefCallback<HTMLElement>;
    style?: React.CSSProperties;
    className?: string;
    children?: ReactNode;
  }>;

  return (
    <Comp
      ref={(el) => {
        ref.current = el;
      }}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        // 缓动曲线用 arbitrary property（[transition-timing-function:…]）而不是 ease 的方括号
        // 任意值写法：后者是歧义类名（transition- 与 animation-timing-function 都可能匹配），
        // 构建时告警且不保证生成预期 CSS。曲线本身是「快出慢收」，与原站入场节奏一致。
        // 注：Tailwind 会扫描注释，故本注释刻意不写完整的类名字面量。
        "transition-[opacity,transform] duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] will-change-transform",
        phase === "hidden" ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100",
        className,
      )}
    >
      {children}
    </Comp>
  );
}
