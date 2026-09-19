// 移动端/平板响应式巡检：375x812 与 768x1024 截图
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = "/tmp/shots-mobile";
mkdirSync(OUT, { recursive: true });

const routes = [
  "/",
  "/collections",
  "/products",
  "/products/macrohard-remove-before-flight-keychain",
  "/cart",
  "/checkout",
  "/search",
  "/auth/login",
];
const viewports = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
];

const browser = await chromium.launch();
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  for (const r of routes) {
    try {
      await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(2000);
      // 横向溢出检测
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const name = r.replace(/[/?=&]/g, "_") || "root";
      await page.screenshot({ path: `${OUT}/${vp.name}${name}.png`, fullPage: true });
      console.log(`${vp.name} ${r.padEnd(48)} 横向溢出=${overflow}px ${overflow > 2 ? "⚠️" : ""}`);
    } catch (e) {
      console.log(`${vp.name} ${r} FAIL ${String(e).slice(0, 80)}`);
    }
  }
  await ctx.close();
}
await browser.close();
console.log("shots -> " + OUT);
