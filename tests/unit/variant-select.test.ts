import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VariantSelect } from "@/components/shop/variant-select";

/**
 * 规格选择器（原生 radio + 内联展开）回归 —— 交付审计要求的自研交互护栏。
 * 技术路线对齐原站（fieldset + 原生 radio）：面板**常驻 DOM**、仅用 hidden 切换显隐，
 * 因此「点开零挂载开销」；以下断言锁住这些关键性质，防止被改回浮层实现。
 */
const render = (props: Partial<Parameters<typeof VariantSelect>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(VariantSelect, {
      groupName: "Size",
      value: "L",
      options: ["S", "M", "L", "XL"],
      isSoldOut: () => false,
      onChange: () => {},
      soldOutLabel: "Sold out",
      ...props,
    }),
  );

describe("VariantSelect：原生 radio + 常驻面板", () => {
  it("每个选项渲染为原生 radio（键盘/无障碍由浏览器提供）", () => {
    const html = render();
    expect(html.match(/type="radio"/g)?.length).toBe(4);
    expect(html).toContain('name="Size"');
  });

  it("面板常驻 DOM 且默认 hidden（点开零挂载开销的关键）", () => {
    const html = render();
    expect(html).toContain("variant-panel");
    // 属性顺序由 React 决定，只断言两者同时出现在该面板元素上
    const panelTag = html.slice(html.indexOf("variant-panel") - 200, html.indexOf("variant-panel") + 120);
    expect(panelTag).toContain("hidden");
  });

  it("当前值在触发器上展示，且对应 radio 处于 checked", () => {
    const html = render({ value: "L" });
    expect(html).toMatch(/checked/);
    expect(html).toContain(">L<");
  });

  it("未选择时展示占位（组名）", () => {
    const html = render({ value: "" });
    expect(html).toContain("Size");
  });

  it("售罄项仍可选，仅追加文案标注", () => {
    const html = render({ isSoldOut: (v) => v === "XL" });
    expect(html).toContain("XL — Sold out");
    expect(html.match(/type="radio"/g)?.length).toBe(4); // 未因售罄而移除
  });

  it("触发器带 aria 语义（haspopup/expanded + 组名 aria-label）", () => {
    const html = render();
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Size"');
  });
});
