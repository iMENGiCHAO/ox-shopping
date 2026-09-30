/**
 * 大爷报障重现（2026-10-01 第二报）：颜色选好后点规格下拉菜单,页面抖动一下。
 * 场景：页面滚动到购买面板可见的中间位置（大爷实际使用状态）→ 点开下拉 →
 * 帧级采样 scrollY/trigger 位置/下拉内容高度,捕捉滚动跳动。
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors: string[] = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
});

await page.goto(`${BASE}/zh/products/ox-kids-constellation-hoodie`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);

// 滚动到购买面板可见的中间位置（大爷实际使用状态）
await page.evaluate(() => {
  const rightCol = document.querySelector(".pdp-grid > div:nth-child(2)");
  if (rightCol) rightCol.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(600);
const y0 = await page.evaluate(() => Math.round(window.scrollY));
console.log("[滚动后] scrollY:", y0);

const sizeTrigger = page.locator('button[aria-label="Size"], [role="combobox"]').first();

// 帧级采样（字符串函数体,避开 esbuild __name 注入）
const sample = page.evaluate(
  `new Promise((resolve) => {
    const frames = [];
    const t0 = performance.now();
    const tick = () => {
      const trigger = document.querySelector('button[aria-label="Size"], [role="combobox"]');
      const content = document.querySelector('[role="listbox"]');
      frames.push({
        t: Math.round(performance.now() - t0),
        y: Math.round(window.scrollY),
        trigTop: trigger ? Math.round(trigger.getBoundingClientRect().top) : 0,
        contentH: content ? content.offsetHeight : 0,
      });
      if (frames.length >= 25) resolve({ frames });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`,
) as Promise<{ frames: { t: number; y: number; trigTop: number; contentH: number }[] }>;

// 点开下拉（采样进行中）
const sampling = sample;
await sizeTrigger.click();
const { frames } = await sampling;
const uniq = new Set(frames.map((f) => `${f.y}/${f.trigTop}/${f.contentH}`));
console.log("[打开下拉] 25 帧采样:");
if (uniq.size > 1) {
  console.log("  ⚠️ 检测到变化:");
  for (const f of frames.filter(
    (f, idx, arr) => idx === 0 || `${f.y}/${f.trigTop}/${f.contentH}` !== `${arr[idx - 1]!.y}/${arr[idx - 1]!.trigTop}/${arr[idx - 1]!.contentH}`,
  )) {
    console.log(`    t=${f.t}ms scrollY=${f.y} trigTop=${f.trigTop} contentH=${f.contentH}`);
  }
} else {
  console.log(`  ✓ 25 帧恒定 (${[...uniq][0]})`);
}

// 选中一个选项，再采样（关闭下拉 + focus 回 trigger）
const sample2 = page.evaluate(
  `new Promise((resolve) => {
    const frames = [];
    const t0 = performance.now();
    const tick = () => {
      const trigger = document.querySelector('button[aria-label="Size"], [role="combobox"]');
      frames.push({
        t: Math.round(performance.now() - t0),
        y: Math.round(window.scrollY),
        trigTop: trigger ? Math.round(trigger.getBoundingClientRect().top) : 0,
      });
      if (frames.length >= 25) resolve({ frames });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`,
) as Promise<{ frames: { t: number; y: number; trigTop: number }[] }>;
await page.locator("[role='option']").first().click();
const { frames: frames2 } = await sample2;
const uniq2 = new Set(frames2.map((f) => `${f.y}/${f.trigTop}`));
console.log("[选中选项] 25 帧采样:");
if (uniq2.size > 1) {
  console.log("  ⚠️ 检测到变化:");
  for (const f of frames2.filter(
    (f, idx, arr) => idx === 0 || `${f.y}/${f.trigTop}` !== `${arr[idx - 1]!.y}/${arr[idx - 1]!.trigTop}`,
  )) {
    console.log(`    t=${f.t}ms scrollY=${f.y} trigTop=${f.trigTop}`);
  }
} else {
  console.log(`  ✓ 25 帧恒定 (${[...uniq2][0]})`);
}

console.log("console 错误:", JSON.stringify(consoleErrors.slice(0, 5)));
await browser.close();
console.log("done");
