import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Reveal } from "@/components/shop/reveal";

/**
 * Reveal 的**渐进增强不变量**。
 *
 * 背景（真实缺陷，已修）：此前 SSR 直接输出 `translate-y-4 opacity-0`，靠客户端
 * useEffect 里的 IntersectionObserver 把它改回可见。后果是内容可见性依赖 JS ——
 * 脚本被禁用 / 加载失败 / 加载缓慢时，首页唯一的可见标题（All Products）会永久隐形。
 * 开发环境下若客户端包尚未编译完成就访问，也会复现（已实测到 opacity=0）。
 *
 * 这些断言不碰 DOM、不需要浏览器：直接用 renderToStaticMarkup 拿到服务端输出。
 * 任何把「初始可见」改回「初始隐藏」的改动都会在这里立刻失败。
 */
const render = (over: {
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
} = {}) =>
  renderToStaticMarkup(
    createElement(Reveal, { ...over, children: createElement("h2", null, "All Products") }),
  );

describe("Reveal — 服务端输出必须可见（无 JS 兜底）", () => {
  it("SSR 不得输出隐藏态类名", () => {
    const html = render();
    expect(html).not.toContain("opacity-0");
    expect(html).not.toContain("translate-y-4");
  });

  it("SSR 输出可见态类名", () => {
    const html = render();
    expect(html).toContain("opacity-100");
    expect(html).toContain("translate-y-0");
  });

  it("保留入场动效参数（位移/时长/缓动曲线）", () => {
    const html = render();
    expect(html).toContain("transition-[opacity,transform]");
    expect(html).toContain("duration-700");
    expect(html).toContain("[transition-timing-function:cubic-bezier(0.16,1,0.3,1)]");
  });

  it("子内容照常渲染", () => {
    expect(render()).toContain("All Products");
  });

  it("as 决定标签名", () => {
    expect(render({ as: "section" })).toMatch(/^<section/);
    expect(render({ as: "li" })).toMatch(/^<li/);
    expect(render()).toMatch(/^<div/);
  });

  it("delay 映射为 transitionDelay 内联样式", () => {
    expect(render({ delay: 120 })).toContain("transition-delay:120ms");
    expect(render({ delay: 0 })).not.toContain("transition-delay");
  });

  it("透传 className", () => {
    expect(render({ className: "mt-10" })).toContain("mt-10");
  });
});
