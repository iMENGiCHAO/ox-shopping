// 登录后巡检：管理员后台 + 用户账户/订单页面
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = "/tmp/shots-auth";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push("CONSOLE: " + m.text().slice(0, 200));
});
page.on("pageerror", (e) => problems.push("PAGEERROR: " + String(e).slice(0, 200)));

async function login(email, password, loginPath) {
  await page.goto(BASE + loginPath, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  const emailBox = page.locator('input[type="email"], input[name="email"]').first();
  const passBox = page.locator('input[type="password"]').first();
  await emailBox.fill(email);
  await passBox.fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3500);
  console.log(`login ${email} @ ${loginPath} -> ${page.url()}`);
}

// 1) 管理员登录（后台）
await login("admin@example.com", "Admin@123456", "/admin/login");

const adminRoutes = [
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
for (const r of adminRoutes) {
  problems.length = 0;
  try {
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    const name = r.replace(/[/?=&]/g, "_") || "root";
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    console.log(`OK   ${r.padEnd(30)} len=${bodyLen} ${problems.length ? "ERR:" + problems.slice(0, 2).join(" | ") : ""}`);
  } catch (e) {
    console.log(`FAIL ${r} -> ${String(e).slice(0, 120)}`);
  }
}

// 2) 用户登录（前台），看账户中心
await login("user@example.com", "User@123456", "/auth/login");
const userRoutes = ["/account", "/account/profile", "/account/addresses", "/account/password", "/orders"];
for (const r of userRoutes) {
  problems.length = 0;
  try {
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1800);
    const name = "u" + r.replace(/[/?=&]/g, "_");
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    console.log(`OK   ${r.padEnd(30)} len=${bodyLen} ${problems.length ? "ERR:" + problems.slice(0, 2).join(" | ") : ""}`);
  } catch (e) {
    console.log(`FAIL ${r} -> ${String(e).slice(0, 120)}`);
  }
}

await browser.close();
console.log("\nshots -> " + OUT);
