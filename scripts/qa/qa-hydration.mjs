// 复现 hydration mismatch：按「首页 → 分类 → 列表 → 详情」顺序访问，捕获 React 差异
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const msgs = [];
p.on("console", (m) => {
  const t = m.text();
  if (/hydrat|did not match|server rendered|tree hydrated/i.test(t)) msgs.push(t);
});
p.on("pageerror", (e) => {
  const t = String(e);
  if (/hydrat|did not match/i.test(t)) msgs.push("PAGEERROR " + t);
});

const seq = ["/", "/collections", "/products", "/products/macrohard-remove-before-flight-keychain"];
for (const r of seq) {
  try {
    await p.goto(BASE + r, { waitUntil: "load", timeout: 90000 });
    await p.waitForTimeout(3000);
    console.log(`visited ${r} (hydration 相关消息累计: ${msgs.length})`);
  } catch (e) {
    console.log(`nav fail ${r}: ${String(e).slice(0, 80)}`);
  }
}
console.log("\n共匹配到", msgs.length, "条");
msgs.slice(0, 3).forEach((m, i) => console.log(`\n--- [${i}] ---\n` + m.slice(0, 2000)));
await b.close();
