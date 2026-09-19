#!/usr/bin/env node
/**
 * 设计令牌 DOM 断言（对应 docs/DESIGN.md §1 §2）。
 * 启动 dev/prod 后运行：node scripts/design-assertions.cjs [baseUrl]
 * 退出码 0 = 全部通过；1 = 有断言失败。
 */
const { chromium } = require("@playwright/test");

const BASE = process.argv[2] || process.env.QA_BASE || "http://localhost:3000";
const results = [];
function check(name, actual, ok, expected) {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name.padEnd(34)} 实际=${actual}${ok ? "" : `  期望=${expected}`}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser
    .newContext({ viewport: { width: 1440, height: 900 } })
    .then((c) => c.newPage());

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);

  const home = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const g = (el, p) => (el ? getComputedStyle(el).getPropertyValue(p) : "");
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");
    const btn = Array.from(document.querySelectorAll("button, a")).find((b) =>
      /shop all/i.test(b.textContent || ""),
    );
    return {
      v: {
        background: root.getPropertyValue("--background").trim(),
        foreground: root.getPropertyValue("--foreground").trim(),
        muted: root.getPropertyValue("--muted").trim(),
        border: root.getPropertyValue("--border").trim(),
        ink: root.getPropertyValue("--ink").trim(),
        radius: root.getPropertyValue("--radius").trim(),
      },
      bodyBg: g(document.body, "background-color"),
      bodyFont: g(document.body, "font-family"),
      headerBg: g(header, "background-color"),
      headerH: header ? Math.round(header.getBoundingClientRect().height) : 0,
      footerBg: g(footer, "background-color"),
      btnRadius: btn ? g(btn, "border-radius") : "(no btn)",
    };
  });

  // §1 设计令牌（CSS 变量，hsl 参数形式）
  check("--background = 0 0% 100% (白)", home.v.background, home.v.background === "0 0% 100%", "0 0% 100%");
  check("--foreground = 0 0% 11% (#1C1C1C)", home.v.foreground, home.v.foreground === "0 0% 11%", "0 0% 11%");
  check("--muted = 0 0% 93.7% (#EFEFEF)", home.v.muted, home.v.muted === "0 0% 93.7%", "0 0% 93.7%");
  check("--border = 0 0% 86.7% (#DDD)", home.v.border, home.v.border === "0 0% 86.7%", "0 0% 86.7%");
  check("--ink = 0 0% 0% (#000)", home.v.ink, home.v.ink === "0 0% 0%", "0 0% 0%");
  check("--radius = 0rem (全直角)", home.v.radius, home.v.radius === "0rem", "0rem");
  check("页面背景 = 白", home.bodyBg.replace(/\s/g, ""), home.bodyBg.replace(/\s/g, "") === "rgb(255,255,255)", "rgb(255,255,255)");
  check("正文字体含 Helvetica", home.bodyFont.includes("Helvetica"), home.bodyFont.includes("Helvetica"), "Helvetica 栈");

  // §2 布局
  check("头部高 65px", home.headerH + "px", home.headerH === 65, "65px");
  check("头部背景 = 黑", home.headerBg.replace(/\s/g, ""), home.headerBg.replace(/\s/g, "") === "rgb(0,0,0)", "rgb(0,0,0)");
  check("页脚背景 = 黑", home.footerBg.replace(/\s/g, ""), home.footerBg.replace(/\s/g, "") === "rgb(0,0,0)", "rgb(0,0,0)");
  check("按钮直角", home.btnRadius, home.btnRadius === "0px", "0px");

  // 商品详情页
  await page.goto(BASE + "/products", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(1500);
  const link = await page.evaluate(
    () => document.querySelector('a[href*="/products/"]')?.getAttribute("href") || "",
  );
  if (link) {
    await page.goto(BASE + link, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2000);
    const pdp = await page.evaluate(() => {
      const g = (el, p) => (el ? getComputedStyle(el).getPropertyValue(p) : "");
      const cta = Array.from(document.querySelectorAll("button")).find((b) =>
        /add to cart/i.test(b.textContent || ""),
      );
      const h1 = document.querySelector("h1");
      return {
        ctaH: cta ? Math.round(cta.getBoundingClientRect().height) : 0,
        ctaBg: g(cta, "background-color"),
        ctaRadius: g(cta, "border-radius"),
        h1Size: h1 ? g(h1, "font-size") : "",
        ctaW: cta ? Math.round(cta.getBoundingClientRect().width) : 0,
      };
    });
    check("PDP 加购按钮高 46px", pdp.ctaH + "px", pdp.ctaH === 46, "46px");
    check("PDP 加购按钮直角", pdp.ctaRadius, pdp.ctaRadius === "0px", "0px");
    check("PDP 标题 22px", pdp.h1Size, pdp.h1Size === "22px", "22px");
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
