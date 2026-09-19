// 诊断：抓某页面所有失败请求(4xx/5xx)的 URL，以及 hydration 报错详情
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const routes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/", "/products/macrohard-remove-before-flight-keychain", "/cart"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const route of routes) {
  const failures = [];
  const consoleErrs = [];
  const onResp = (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  };
  const onConsole = (m) => {
    if (m.type() === "error") consoleErrs.push(m.text().slice(0, 500));
  };
  page.on("response", onResp);
  page.on("console", onConsole);
  try {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
  } catch (e) {
    console.log("NAV FAIL", route, String(e).slice(0, 120));
  }
  page.off("response", onResp);
  page.off("console", onConsole);
  console.log(`\n===== ${route} =====`);
  const uniq = [...new Set(failures)];
  console.log("失败请求:");
  uniq.forEach((f) => console.log("  " + f));
  console.log("console errors:");
  [...new Set(consoleErrs)].forEach((f) => console.log("  " + f.replace(/\n/g, " ").slice(0, 400)));
}

await browser.close();
