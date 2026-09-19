// 全站内链爬取：从入口页出发收集站内链接，逐个检查是否 404/500
import { chromium } from "@playwright/test";
const BASE = process.env.QA_BASE || "http://localhost:3000";

const seeds = [
  "/",
  "/collections",
  "/products",
  "/cart",
  "/search",
  "/pages/faqs",
  "/policies/privacy",
];
const SKIP = /\/(api|_next|admin|auth|checkout|account|orders)\b/;

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const links = new Set();

// 商品详情页的 slug **不写死**：库存跨测试递减（seed 用 update:{} 不重置），
// 硬编码的商品可能已售罄 → 页面形态变化、覆盖率静默下降。
// 与 qa-layout.mjs 同口径：从 API 挑一个在售的。
await page.goto(BASE + "/products", { waitUntil: "domcontentloaded", timeout: 120000 });
const slug = await page.evaluate(async () => {
  const r = await fetch("/api/products?pageSize=50");
  const j = await r.json();
  const rows = j?.data ?? [];
  return rows.find((p) => (p.stock ?? 0) > 0)?.slug ?? rows[0]?.slug ?? null;
});
if (slug) {
  seeds.splice(3, 0, `/products/${slug}`);
  console.log(`商品详情页种子：/products/${slug}`);
} else {
  console.log("⚠️  未能取到在售商品 slug，跳过商品详情页种子");
}

for (const s of seeds) {
  try {
    await page.goto(BASE + s, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1200);
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")),
    );
    for (const h of hrefs) {
      if (!h || h.startsWith("http") || h.startsWith("mailto:") || h.startsWith("#")) continue;
      const path = h.split("#")[0];
      if (SKIP.test(path)) continue;
      links.add(path);
    }
  } catch (e) {
    console.log("seed fail", s, String(e).slice(0, 60));
  }
}

console.log(`收集到 ${links.size} 个站内链接，开始检查...\n`);
const bad = [];
for (const l of [...links].sort()) {
  try {
    const res = await page.request.get(BASE + l, { timeout: 60000 });
    if (res.status() >= 400) {
      bad.push(`${res.status()} ${l}`);
      console.log(`❌ ${res.status()} ${l}`);
    }
  } catch (e) {
    bad.push(`ERR ${l}`);
    console.log(`❌ ERR ${l} ${String(e).slice(0, 60)}`);
  }
}
console.log(`\n检查完成：${links.size} 个链接，异常 ${bad.length} 个`);
await browser.close();
