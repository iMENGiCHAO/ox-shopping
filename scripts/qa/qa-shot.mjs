// 全页截图：等网络空闲 + 滚动触发懒加载后再截，尽量还原真实布局
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = process.env.QA_OUT || "/tmp/shots";
mkdirSync(OUT, { recursive: true });

const targets = process.argv.slice(2);
const routes = targets.length ? targets : ["/"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const route of routes) {
  try {
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90000 });
  } catch {
    /* networkidle 可能超时，继续 */
  }
  // 触发懒加载：滚到底再回顶
  await page.evaluate(async () => {
    await new Promise((r) => {
      let y = 0;
      const step = () => {
        window.scrollBy(0, 600);
        y += 600;
        if (y < document.body.scrollHeight + 1200) setTimeout(step, 60);
        else r();
      };
      step();
    });
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  const name = route.replace(/[/?=&]/g, "_") || "root";
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("shot:", `${OUT}/${name}.png`);
}

await browser.close();
