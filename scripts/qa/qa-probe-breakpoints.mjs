// 定点探针：PDP / cart 在不同视口下的**布局模式**，用于确认「断点偏差带」是否真实存在。
// 只测量、不断言，永远 exit 0。
//
// 背景：原站断点是 700 / 1000，但 .tsx 里仍有 151 处 Tailwind 默认断点
// （sm:640 / md:768 / lg:1024）。若 PDP 的「媒体列 + 信息栏」两栏切换点在 lg(1024)，
// 则 1000~1023px 区间原站已是两栏、本地仍是单栏 —— 这是一条真实的偏差带。
//
// 运行：node scripts/qa/qa-probe-breakpoints.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const WIDTHS = [375, 699, 700, 767, 768, 999, 1000, 1023, 1024, 1025, 1216];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1216, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(180_000);

// 先取一个有货商品
await page.goto(BASE + "/products", { waitUntil: "domcontentloaded" });
const slug = await page.evaluate(async () => {
  const r = await fetch("/api/products?pageSize=50");
  const j = await r.json();
  const rows = j?.data ?? [];
  return rows.find((p) => (p.stock ?? 0) > 0)?.slug ?? rows[0]?.slug ?? null;
});
console.log("样本商品:", slug);

console.log("\n── PDP 布局模式 ──");
console.log("视口   | 主图宽 | 信息栏左 | 栅格列数 | 模式");
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  try {
    await page.goto(`${BASE}/products/${slug}`, { waitUntil: "domcontentloaded" });
  } catch (err) {
    // 本卷上首次编译可能超过 180s。探针声明「永远 exit 0」，故单点失败只标注、不中断。
    console.log(`${String(w).padStart(5)}  | (goto 超时，跳过) ${String(err).slice(0, 60)}`);
    continue;
  }
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    const main = imgs.find((i) => i.getBoundingClientRect().width > 200 && !i.closest("header"));
    const mr = main?.getBoundingClientRect();
    const g = [...document.querySelectorAll('[class*="grid"]')].find(
      (el) => el.querySelector("img") && el.getBoundingClientRect().width > 300,
    );
    const cols = g ? getComputedStyle(g).gridTemplateColumns.split(/\s+/).filter(Boolean) : [];
    // 信息栏：PDP 里承载「商品名」的 h1 的容器
    const h1 = document.querySelector("h1");
    const hr = h1?.getBoundingClientRect();
    return {
      mainW: mr ? Math.round(mr.width) : 0,
      infoLeft: hr ? Math.round(hr.left) : 0,
      colCount: cols.length,
      cols: cols.map((c) => Math.round(parseFloat(c))).join("/"),
    };
  });
  const mode = m.colCount >= 2 ? "两栏" : "单栏";
  console.log(
    `${String(w).padStart(5)}  | ${String(m.mainW).padStart(6)} | ${String(m.infoLeft).padStart(8)} | ${String(m.colCount).padStart(8)} | ${mode}   [${m.cols}]`,
  );
}

console.log("\n── /cart 布局模式（是否有商品看空态/表格） ──");
console.log("视口   | 主列宽 | 布局");
for (const w of [375, 699, 700, 767, 768, 999, 1000, 1024, 1216]) {
  await page.setViewportSize({ width: w, height: 900 });
  try {
    await page.goto(BASE + "/cart", { waitUntil: "domcontentloaded" });
  } catch (err) {
    console.log(`${String(w).padStart(5)}  | (goto 超时，跳过)`);
    continue;
  }
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const h = document.querySelector("h1, h2");
    const r = h?.getBoundingClientRect();
    // 空态是居中的，宽度小；有表格时会有较宽的容器
    return { hw: r ? Math.round(r.width) : 0, hleft: r ? Math.round(r.left) : 0, bodyW: document.body.scrollWidth };
  });
  console.log(`${String(w).padStart(5)}  | ${String(m.hw).padStart(6)} | 标题左缘 ${m.hleft}  body 宽 ${m.bodyW}`);
}

await browser.close();
