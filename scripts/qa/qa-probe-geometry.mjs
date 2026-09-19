// 几何「只测量、不断言」探针 —— 用于拿本地实现的真实数值。
// 与 qa-parity-geometry.mjs 的区别：本脚本永远 exit 0，只打印原始数据，
// 便于「先看清现状，再决定期望值」，避免把没核实的数字写进断言。
//
// 视口固定 1216：仓库里记录的原站实测值（PLP 341×341 / 间距 48、collections 353×353
// / 间距 30、cart 按钮 174px）都对应 1216 布局宽，用别的视口比会得出错误结论。
//
// 运行：node scripts/qa/qa-probe-geometry.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const VIEWPORT = { width: 1216, height: 900 };

const ROUTES = ["/", "/products", "/collections", "/cart"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
page.setDefaultTimeout(180_000);

// 预编译：本卷上首次访问单路由可超过 90s，不预热会在测量前就 goto 超时
console.log("预热路由（首次编译较慢）…");
for (const r of ROUTES) {
  const t0 = Date.now();
  await page.goto(BASE + r, { waitUntil: "domcontentloaded" });
  console.log(`  ${r} 就绪 ${Date.now() - t0}ms`);
}

/**
 * 所有几何计算都在**浏览器内**完成并返回纯数据。
 * 踩过的坑：`page.evaluate` 返回的是序列化结果，DOM 元素出不来 ——
 * 在外面写 `box(el)` 会直接 `el.getBoundingClientRect is not a function`。
 */
const measure = (fn) => page.evaluate(fn);

// ── 首页 ────────────────────────────────────────────────
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const home = await measure(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      cols: cs.gridTemplateColumns,
      colGap: cs.columnGap,
      rowGap: cs.rowGap,
      padX: cs.paddingLeft,
    };
  };
  const h = [...document.querySelectorAll("h1,h2")].find((x) =>
    /All Products|全部商品/i.test(x.textContent || ""),
  );
  const cards = [...document.querySelectorAll('a[href*="/products/"]')];
  const grid = cards[0]?.closest('[class*="grid"]');
  return {
    heading: box(h),
    grid: box(grid),
    firstCard: box(cards[0]),
    media: box(cards[0]?.querySelector("img")?.parentElement),
    cardCount: cards.length,
  };
});
console.log("\n── 首页 ──");
console.log("  H2(All Products):", JSON.stringify(home.heading));
console.log("  商品网格        :", JSON.stringify(home.grid));
console.log("  首张商品卡      :", JSON.stringify(home.firstCard));
console.log("  卡片内媒体盒    :", JSON.stringify(home.media));
console.log("  卡片数          :", home.cardCount);

// ── PLP /products ───────────────────────────────────────
await page.goto(BASE + "/products", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const plp = await measure(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      fontSize: cs.fontSize,
      cols: cs.gridTemplateColumns,
      colGap: cs.columnGap,
      rowGap: cs.rowGap,
      padX: cs.paddingLeft,
    };
  };
  const h = document.querySelector("h1");
  const cards = [...document.querySelectorAll('a[href*="/products/"]')];
  const grid = cards[0]?.closest('[class*="grid"]');
  return {
    heading: box(h),
    shell: box(h?.parentElement),
    grid: box(grid),
    cards: cards.slice(0, 7).map(box),
    media: box(cards[0]?.querySelector("img")?.parentElement),
  };
});
console.log("\n── PLP /products ──");
console.log("  H1              :", JSON.stringify(plp.heading));
console.log("  容器            :", JSON.stringify(plp.shell));
console.log("  网格            :", JSON.stringify(plp.grid));
plp.cards.forEach((c, i) => console.log(`  卡片[${i}]        :`, JSON.stringify(c)));
console.log("  卡片内媒体盒    :", JSON.stringify(plp.media));

// ── collections ─────────────────────────────────────────
await page.goto(BASE + "/collections", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const coll = await measure(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      fontSize: cs.fontSize,
      color: cs.color,
      bg: cs.backgroundColor,
      gap: cs.gap,
      cols: cs.gridTemplateColumns,
    };
  };
  const h = document.querySelector("h1");
  const links = [...document.querySelectorAll('a[href*="category="]')];
  const grid = links[0]?.parentElement;
  return {
    heading: box(h),
    surface: box(document.querySelector(".bg-surface") || document.querySelector("main > div")),
    grid: box(grid),
    links: links.slice(0, 4).map(box),
    cap: box(links[0]?.querySelector("span")),
  };
});
console.log("\n── /collections ──");
console.log("  H1              :", JSON.stringify(coll.heading));
console.log("  页面容器        :", JSON.stringify(coll.surface));
console.log("  网格            :", JSON.stringify(coll.grid));
coll.links.forEach((c, i) => console.log(`  卡片[${i}]        :`, JSON.stringify(c)));
console.log("  卡内标题        :", JSON.stringify(coll.cap));

// ── cart 空态 ───────────────────────────────────────────
await page.goto(BASE + "/cart", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const cart = await measure(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      fontSize: cs.fontSize,
      bg: cs.backgroundColor,
      padX: cs.paddingLeft,
    };
  };
  const h = document.querySelector("h1,h2");
  const btn = [...document.querySelectorAll("a,button")].find((b) =>
    /shop all|continue shopping|去购物|选购|开始购物/i.test(b.textContent || ""),
  );
  return { heading: box(h), btn: box(btn), btnText: btn?.textContent?.trim() };
});
console.log("\n── /cart（空态）──");
console.log("  标题            :", JSON.stringify(cart.heading));
console.log(`  按钮「${cart.btnText}」:`, JSON.stringify(cart.btn));

// ── PDP ─────────────────────────────────────────────────
const slug = await measure(async () => {
  const r = await fetch("/api/products?pageSize=1");
  const j = await r.json();
  return j?.data?.[0]?.slug ?? null;
});
if (slug) {
  await page.goto(`${BASE}/products/${slug}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const pdp = await measure(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        cols: cs.gridTemplateColumns,
        colGap: cs.columnGap,
        padX: cs.paddingLeft,
      };
    };
    const imgs = [...document.querySelectorAll("img")];
    const main = imgs.find((i) => i.getBoundingClientRect().width > 300);
    const grid = [...document.querySelectorAll('[class*="grid"]')].find(
      (el) => el.querySelector("img") && el.getBoundingClientRect().width > 600,
    );
    const title = document.querySelector("h1");
    const addBtn = [...document.querySelectorAll("button")].find((b) =>
      /add to cart|加入购物车/i.test(b.textContent || ""),
    );
    const thumbs = imgs
      .filter((i) => {
        const w = i.getBoundingClientRect().width;
        // 排除页头：Logo 宽 66px，会落进「缩略图尺寸」的窗口而被误当成缩略图
        return !i.closest("header") && w > 30 && w < 90;
      })
      .slice(0, 3);
    return {
      main: box(main),
      grid: box(grid),
      gridClass: grid?.className?.slice(0, 140),
      title: box(title),
      addBtn: box(addBtn),
      thumbs: thumbs.map(box),
    };
  });
  console.log(`\n── PDP /products/${slug} ──`);
  console.log("  主图            :", JSON.stringify(pdp.main));
  console.log("  栅格            :", JSON.stringify(pdp.grid));
  console.log("  栅格 class      :", pdp.gridClass);
  console.log("  H1              :", JSON.stringify(pdp.title));
  console.log("  加购按钮        :", JSON.stringify(pdp.addBtn));
  console.log("  缩略图          :", pdp.thumbs.map((t) => JSON.stringify(t)).join("\n                    "));
}

await browser.close();
