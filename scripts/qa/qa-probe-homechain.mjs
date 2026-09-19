// 定点探针：首页「横幅底 → h2 → 商品网格」这条垂直链的真实数值。
// 只测量、不断言，永远 exit 0。
//
// 起因：--home-head-pt 声明 66px，但 1216 视口下横幅底(≈406)+66 应得 h2 行盒 472，
// 实测却是 488 —— 多出 16px。不猜，把链上每一环都量出来。
//
// 运行：node scripts/qa/qa-probe-homechain.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1216, height: 900 } }).then((c) => c.newPage());
page.setDefaultTimeout(180_000);

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const chain = await page.evaluate(() => {
  const info = (el, label) => {
    if (!el) return { label, missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      label,
      tag: el.tagName.toLowerCase(),
      cls: (el.className || "").toString().slice(0, 90),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      h: Math.round(r.height),
      mt: cs.marginTop,
      mb: cs.marginBottom,
      pt: cs.paddingTop,
      pb: cs.paddingBottom,
      lh: cs.lineHeight,
      fs: cs.fontSize,
    };
  };

  const header = document.querySelector("header");
  const heroSection = document.querySelector("section.grid");
  const h2 = [...document.querySelectorAll("h2")].find((x) => /All Products|全部商品/i.test(x.textContent || ""));
  const gridWrap = h2?.parentElement?.querySelector("div");
  const grid = document.querySelector('a[href*="/products/"]')?.closest('[class*="grid"]');

  const out = [
    info(header, "header"),
    info(heroSection, "hero section"),
    info(heroSection?.firstElementChild, "hero 左幅"),
    info(h2?.parentElement, "h2 的父 section"),
    info(h2, "h2 All Products"),
    info(gridWrap, "网格外层 div"),
    info(grid, "网格"),
  ];

  // 关键：横幅 section 的**最后一个孩子**底缘，才是「横幅底」
  const heroKids = heroSection ? [...heroSection.children] : [];
  out.push(info(heroKids[heroKids.length - 1], "hero 最后一个孩子"));

  return out;
});

console.log("── 首页垂直链（1216 视口）──");
for (const r of chain) {
  if (r.missing) { console.log(`  ${r.label}: (未找到)`); continue; }
  console.log(
    `  ${r.label.padEnd(18)} ${r.tag.padEnd(8)} top=${String(r.top).padStart(4)} bottom=${String(r.bottom).padStart(4)} h=${String(r.h).padStart(3)} ` +
      `mt=${r.mt.padStart(7)} mb=${r.mb.padStart(7)} pt=${r.pt.padStart(7)} lh=${r.lh.padStart(7)} fs=${r.fs}`,
  );
  if (r.cls) console.log(`      cls: ${r.cls}`);
}

await browser.close();
