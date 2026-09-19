// 控制台探针：抓首页的 console 输出与未捕获异常（判断是否 hydration 失败）。
// 只测量、不断言，永远 exit 0。
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1216, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(180_000);

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 800)}`));
page.on("requestfailed", (r) => logs.push(`[reqfail] ${r.url().slice(0, 160)} — ${r.failure()?.errorText}`));

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

// 判断该客户端组件是否真的完成 hydration：看 React 是否挂上 fiber（__reactFiber$ 前缀属性）
const hydrated = await page.evaluate(() => {
  const stuck = [...document.querySelectorAll("div")].find(
    (d) => /translate-y-4/.test(d.className || "") && /opacity-0/.test(d.className || ""),
  );
  if (!stuck) return { found: false };
  const keys = Object.keys(stuck);
  return {
    found: true,
    hasFiber: keys.some((k) => k.startsWith("__reactFiber$")),
    hasProps: keys.some((k) => k.startsWith("__reactProps$")),
    reactKeys: keys.filter((k) => k.startsWith("__react")).map((k) => k.slice(0, 22)),
    // 该元素上是否还挂着 next 的 hydration 标记
    className: stuck.className,
  };
});

console.log("── 首页控制台 ──");
if (!logs.length) console.log("  (无输出)");
for (const l of logs) console.log("  " + l);
console.log("\n── h2 包装 div 的 hydration 证据 ──");
console.log(JSON.stringify(hydrated, null, 2));

await browser.close();
