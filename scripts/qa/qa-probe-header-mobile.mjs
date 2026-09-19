// 定点探针：移动端页头 Logo 的水平位置与居中情况。
// 只测量、不断言，永远 exit 0。
//
// 起因：#12 的 M5 记录「移动端 Logo 偏离中心 5.5px」。但样式用的是
// `.header-logo { position:absolute; left:50%; transform:translateX(-50%) }`，
// 数学上是精确居中 —— 所以先量清楚到底是「元素没居中」还是「图内留白导致视觉偏移」。
//
// 原站记录值：375 视口下 Logo 左缘 x=153。
//
// 运行：node scripts/qa/qa-probe-header-mobile.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const WIDTHS = [375, 640, 700, 1000];

const browser = await chromium.launch();

for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 812 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180_000);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        left: Math.round(r.left * 10) / 10,
        right: Math.round(r.right * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        cx: Math.round((r.left + r.width / 2) * 10) / 10,
        position: cs.position,
        left_style: cs.left,
        transform: cs.transform,
        padLeft: cs.paddingLeft,
      };
    };
    const bar = document.querySelector(".header-bar");
    const logo = document.querySelector(".header-logo");
    const img = logo?.querySelector("img");
    // 图标/按钮（页头右侧）
    const icons = bar
      ? [...bar.querySelectorAll("button, a")].filter((e) => e !== logo)
      : [];
    return {
      viewportW: window.innerWidth,
      bar: box(bar),
      logo: box(logo),
      img: box(img),
      imgNatural: img ? `${img.naturalWidth}×${img.naturalHeight}` : null,
      logoCenter: logo ? Math.round(((logo.getBoundingClientRect().left + logo.getBoundingClientRect().width / 2) * 10)) / 10 : null,
      viewportCenter: window.innerWidth / 2,
      icons: icons.map((e) => ({ tag: e.tagName.toLowerCase(), ...box(e) })),
    };
  });

  console.log(`\n── 视口 ${w}px ──`);
  console.log(`  视口中线      : ${m.viewportCenter}`);
  console.log(`  header-bar    : ${JSON.stringify(m.bar)}`);
  console.log(`  logo 盒       : ${JSON.stringify(m.logo)}`);
  console.log(`  logo 中心     : ${m.logoCenter}  → 与视口中线差 ${Math.round((m.logoCenter - m.viewportCenter) * 10) / 10}px`);
  console.log(`  logo <img>    : ${JSON.stringify(m.img)}  natural=${m.imgNatural}`);
  m.icons.forEach((i, k) => console.log(`  图标[${k}] ${i.tag}  : ${JSON.stringify(i)}`));
  await ctx.close();
}

await browser.close();
