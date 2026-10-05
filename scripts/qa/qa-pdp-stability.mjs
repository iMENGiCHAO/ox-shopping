/**
 * qa-pdp-stability.mjs —— 商品详情页「规格交互零位移」回归（大爷 2026-10-05 反馈）。
 *
 * 背景：大爷反馈「选一次规格下拉，大图/页面抖一下」。排查中踩过两个测量陷阱，
 * 本脚本固化正确测法，避免后人重走弯路：
 *   1. **不能用 page.click()**：Playwright 在元素位于视口外时会先
 *      scrollIntoViewIfNeeded 把页面滚过去（实测 532px），会把工具行为误判成站点抖动。
 *      必须用 page.mouse.click(坐标)——真实用户只会点「看得见」的控件。
 *   2. **必须断言大图几何**：只看 scrollY 不够（视觉抖动也可能来自图片重挂/布局）。
 *
 * 覆盖真凶（均已修复，本脚本防回归）：
 *   · Radix SelectTrigger onClick 裸 focus() 触发滚动（ui/select.tsx 已 preventDefault 分流）
 *   · 色卡原生点击聚焦滚动（buy-panel.tsx 已 pointerdown preventDefault）
 *   · Chrome 滚动锚定在 sticky 双栏下的过冲（PDP 右栏已 overflow-anchor:none）
 *
 * 用法：BASE=http://localhost:3100 node scripts/qa/qa-pdp-stability.mjs
 *   退出码 0 = 全部零位移；1 = 存在位移（打印明细）
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:3000";
const SLUG = process.env.SLUG || "ox-reflective-tee";
const SCROLLS = [200, 400, 560];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let failed = 0;

await page.goto(`${BASE}/zh/products/${SLUG}`, { waitUntil: "networkidle", timeout: 120_000 });

for (const pos of SCROLLS) {
  await page.evaluate((s) => window.scrollTo(0, s), pos);
  await page.waitForTimeout(500);
  const t = await page.evaluate(() => {
    const tr = document.querySelector('button[aria-label="Size"]')?.getBoundingClientRect();
    const img = document.querySelector(".pdp-media img")?.getBoundingClientRect();
    return {
      visible: !!tr && tr.top >= 0 && tr.bottom <= window.innerHeight,
      x: tr ? Math.round(tr.x + tr.width / 2) : 0,
      y: tr ? Math.round(tr.y + tr.height / 2) : 0,
      scrollY: window.scrollY,
      imgX: img ? Math.round(img.x) : null,
      imgY: img ? Math.round(img.y) : null,
    };
  });
  if (!t.visible) {
    console.log(`  scroll=${pos}  规格控件不在视口（真实用户不可点）—— 跳过`);
    continue;
  }
  await page.mouse.click(t.x, t.y);
  await page.waitForTimeout(350);
  const opt = await page.evaluate(() => {
    // 兼容两种实现：原生 radio 面板（.variant-panel label，现役）与 Radix 浮层（[role=option]，历史）
    const nodes = [...document.querySelectorAll(".variant-panel label, [role='option']")];
    const o = nodes.find((e) => e.textContent.trim().startsWith("L"));
    if (!o) return null;
    const r = o.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  if (opt) {
    await page.mouse.click(opt.x, opt.y);
    await page.waitForTimeout(450);
  }
  const a = await page.evaluate(() => {
    const img = document.querySelector(".pdp-media img")?.getBoundingClientRect();
    return { scrollY: window.scrollY, imgX: img ? Math.round(img.x) : null, imgY: img ? Math.round(img.y) : null };
  });
  const dScroll = a.scrollY - t.scrollY;
  const dImg = a.imgX - t.imgX || a.imgY - t.imgY;
  const okRun = dScroll === 0 && dImg === 0;
  if (!okRun) failed++;
  console.log(
    `  scroll=${pos}  scrollY Δ${dScroll}  大图 Δ(${a.imgX - t.imgX},${a.imgY - t.imgY})  ${okRun ? "✅" : "❌"}`,
  );
}

await browser.close();
if (failed > 0) {
  console.error(`\n❌ ${failed} 处规格交互存在位移（页面/大图被滚动或重排）`);
  process.exit(1);
}
console.log("\n✅ 规格交互零位移（页面与大图均未移动）");
