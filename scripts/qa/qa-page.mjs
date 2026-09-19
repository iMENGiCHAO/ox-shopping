// 通用：登录后截指定页面（默认管理员）
// 用法: node scripts/qa/qa-page.mjs /admin/orders [outName]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE = "http://localhost:3000";
const route = process.argv[2] || "/admin";
const out = process.argv[3] || route.replace(/[/?=&]/g, "_") || "root";
const OUT = "/tmp/shots-page";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const api = ctx.request;
await api.get(BASE + "/api/auth/csrf");
const csrf = (await ctx.cookies()).find((c) => /csrf/i.test(c.name))?.value || "";
const r = await api.post(BASE + "/api/auth/login", {
  data: { email: "admin@example.com", password: "Admin@123456", scope: "admin" },
  headers: { "x-csrf-token": csrf },
});
console.log("login:", r.status());

const page = await ctx.newPage();
await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 90000 });
// 等网络空闲 + 额外等待，确保客户端取数完成
try {
  await page.waitForLoadState("networkidle", { timeout: 30000 });
} catch {
  /* ignore */
}
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/${out}.png`, fullPage: true });
const txt = await page.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 300));
console.log("页面文本:", txt);
console.log("shot ->", `${OUT}/${out}.png`);
await browser.close();
