// 定点探针：本地 PDP 的两栏切换点（验证是否已从 1024 改到 1000）。
// 只测量、不断言，永远 exit 0。
//
// 背景：PDP 两栏断点经历史取证确认为 1000px（取证脚本已随上游对齐阶段移除）。
// 本地此前用 lg:(1024px)，在 1000~1023px 显示单栏，属真实偏差。
// 本脚本在切换点附近逐像素确认。
//
// 运行：node scripts/qa/qa-probe-local-pdp-bp.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const WIDTHS = [999, 1000, 1001, 1010, 1023, 1024, 1025, 1216];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1216, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(180_000);

await page.goto(BASE + "/products", { waitUntil: "domcontentloaded" });
const slug = await page.evaluate(async () => {
  const r = await fetch("/api/products?pageSize=50");
  const j = await r.json();
  const rows = j?.data ?? [];
  return rows.find((p) => (p.stock ?? 0) > 0)?.slug ?? rows[0]?.slug ?? null;
});
console.log("样本商品:", slug, "\n");

console.log("视口   | 栅格列 | 主图宽 | 信息栏左 | 模式");
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  try {
    await page.goto(`${BASE}/products/${slug}`, { waitUntil: "domcontentloaded" });
  } catch {
    console.log(`${String(w).padStart(5)}  | (goto 超时，跳过)`);
    continue;
  }
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const g = document.querySelector(".pdp-grid");
    const cols = g ? getComputedStyle(g).gridTemplateColumns.split(/\s+/).filter(Boolean) : [];
    const imgs = [...document.querySelectorAll("img")];
    const main = imgs.find((i) => i.getBoundingClientRect().width > 200 && !i.closest("header"));
    const mr = main?.getBoundingClientRect();
    const h1 = document.querySelector("h1");
    const hr = h1?.getBoundingClientRect();
    return {
      colCount: cols.length,
      cols: cols.map((c) => Math.round(parseFloat(c))).join("/"),
      mainW: mr ? Math.round(mr.width) : 0,
      infoLeft: hr ? Math.round(hr.left) : 0,
    };
  });
  const mode = m.colCount >= 2 ? "两栏" : "单栏";
  console.log(
    `${String(w).padStart(5)}  | ${String(m.colCount).padStart(6)} | ${String(m.mainW).padStart(6)} | ${String(m.infoLeft).padStart(8)} | ${mode}  [${m.cols}]`,
  );
}

await browser.close();
