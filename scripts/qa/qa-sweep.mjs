// 一次性 QA 巡检脚本：跑遍所有公开页面，抓状态码 / 控制台错误 / 页面标题 / 截图
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = "/tmp/qa";
mkdirSync(OUT, { recursive: true });

const publicRoutes = [
  "/",
  "/collections",
  "/products",
  "/products/macrohard-remove-before-flight-keychain",
  "/search",
  "/cart",
  "/checkout",
  "/pages/faqs",
  "/pages/accessibility-statement",
  "/policies/privacy",
  "/policies/terms",
  "/policies/refund",
  "/policies/cookies",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/verify-email",
  "/admin/login",
  "/this-page-should-404",
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const results = [];
for (const route of publicRoutes) {
  const errors = [];
  const onConsole = (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300));
  };
  const onPageError = (e) => errors.push("PAGEERROR: " + String(e).slice(0, 300));
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  let status = 0;
  let title = "";
  let textLen = 0;
  try {
    const res = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 });
    status = res ? res.status() : 0;
    await page.waitForTimeout(1200);
    title = await page.title();
    textLen = (await page.evaluate(() => document.body.innerText.length)) || 0;
    const safe = route.replace(/[/?=&]/g, "_") || "root";
    await page.screenshot({ path: `${OUT}${safe}.png` });
  } catch (err) {
    errors.push("NAV_FAIL: " + String(err).slice(0, 200));
  }
  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  results.push({ route, status, title, textLen, errors });
  console.log(
    `${String(status).padEnd(4)} ${route.padEnd(50)} len=${String(textLen).padEnd(6)} ${errors.length ? "ERR:" + errors.length : ""}`,
  );
}

writeFileSync("/tmp/qa-sweep.json", JSON.stringify(results, null, 2));
await browser.close();
console.log("\nJSON -> /tmp/qa-sweep.json  screenshots -> /tmp/qa/");
