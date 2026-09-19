// 定点探针：Reveal 入场动画是否真的触发（opacity / transform 是否归零）。
// 只测量、不断言，永远 exit 0。
//
// 起因：首页 h2 的父元素是 Reveal 包装 div，实测其 rect 比布局位置低 16px
// （translate-y-4 = 16px），怀疑 `shown` 未置 true —— 那样元素会同时带
// opacity-0，即首页标题/商品网格**整块不可见**（几何仍可测，故几何探针看不出）。
//
// 运行：node scripts/qa/qa-probe-reveal.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1216, height: 900 } }).then((c) => c.newPage());
page.setDefaultTimeout(180_000);

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000); // 给 hydration + observer 充足时间

const snap = async (tag) =>
  page.evaluate((t) => {
    const els = [...document.querySelectorAll("div")].filter((d) =>
      /translate-y-(0|4)/.test(d.className || ""),
    );
    return {
      tag: t,
      scrollY: Math.round(window.scrollY),
      total: els.length,
      rows: els.slice(0, 12).map((d) => {
        const r = d.getBoundingClientRect();
        const cs = getComputedStyle(d);
        return {
          top: Math.round(r.top),
          h: Math.round(r.height),
          opacity: cs.opacity,
          transform: cs.transform,
          shown: /translate-y-0/.test(d.className || ""),
        };
      }),
    };
  }, tag);

const a = await snap("静止 4s 后");
console.log("── Reveal 状态：静止 4s 后 ──");
console.log(`  滚动位置=${a.scrollY}  Reveal 元素数=${a.total}`);
for (const r of a.rows) {
  console.log(
    `  top=${String(r.top).padStart(5)} h=${String(r.h).padStart(4)} opacity=${r.opacity.padStart(4)} shown=${String(r.shown).padEnd(5)} transform=${r.transform}`,
  );
}

// 滚到底再回顶，看是否会触发
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(2500);
const b = await snap("滚到底后");
console.log("\n── Reveal 状态：滚到底后 ──");
console.log(`  滚动位置=${b.scrollY}  Reveal 元素数=${b.total}`);
const hidden = b.rows.filter((r) => r.opacity !== "1");
console.log(`  仍非全不透明(前 12 个中): ${hidden.length}`);

await browser.close();
