// 用 API 登录拿 cookie，再截后台各页面（避开 UI 交互不确定性）
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = "/tmp/shots-admin";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// 1) API 登录（管理员）
const api = ctx.request;
await api.get(BASE + "/api/auth/csrf");
const cookies = await ctx.cookies();
const csrf = cookies.find((c) => /csrf/i.test(c.name))?.value || "";
const loginRes = await api.post(BASE + "/api/auth/login", {
  data: { email: "admin@example.com", password: "Admin@123456", scope: "admin" },
  headers: { "x-csrf-token": csrf, "content-type": "application/json" },
});
console.log("login status:", loginRes.status(), (await loginRes.text()).slice(0, 120));

const page = await ctx.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => problems.push("PAGEERROR " + String(e).slice(0, 160)));

const routes = [
  "/admin",
  "/admin/products",
  "/admin/categories",
  "/admin/orders",
  "/admin/payment-channels",
  "/admin/shipping",
  "/admin/legal",
  "/admin/settings",
  "/admin/users",
  "/admin/audit-logs",
  "/admin/faqs",
  "/admin/notifications",
  "/admin/notify-me",
  "/admin/refunds",
];
for (const r of routes) {
  problems.length = 0;
  try {
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2200);
    const name = r.replace(/[/?=&]/g, "_") || "root";
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const len = await page.evaluate(() => document.body.innerText.length);
    const hasSidebar = await page.evaluate(() => !!document.querySelector("aside, [class*=sidebar]"));
    console.log(`OK   ${r.padEnd(28)} len=${String(len).padEnd(6)} sidebar=${hasSidebar} ${problems.length ? "ERR:" + problems[0] : ""}`);
  } catch (e) {
    console.log(`FAIL ${r} -> ${String(e).slice(0, 100)}`);
  }
}

await browser.close();
console.log("\nshots -> " + OUT);
