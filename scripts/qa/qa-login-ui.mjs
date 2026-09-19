// UI 登录表单测试（后台 + 前台），带网络/错误诊断
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE = "http://localhost:3000";
const OUT = "/tmp/shots-login";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function tryLogin({ path, email, password, label, okRe }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const net = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/auth/login")) net.push(`${r.status()} ${r.url()}`);
  });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("CONSOLE " + m.text().slice(0, 120));
  });

  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true });
  const url = page.url();
  const ok = okRe.test(url);
  console.log(
    `[${label}] 最终URL=${url} ${ok ? "✅ 登录成功" : "❌ 未跳转"} | login请求=${net.join(",") || "无"}`,
  );
  if (!ok) console.log(`   errors: ${errs.slice(0, 3).join(" || ") || "无"}`);
  const body = await page.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 200));
  if (!ok) console.log(`   页面文本: ${body}`);
  await ctx.close();
}

await tryLogin({
  path: "/admin/login",
  email: "admin@example.com",
  password: "Admin@123456",
  label: "admin-login",
  okRe: /\/admin(\/|$)/,
});
await tryLogin({
  path: "/auth/login",
  email: "user@example.com",
  password: "User@123456",
  label: "shop-login",
  okRe: /\/($|\?)/,
});
await browser.close();
console.log("shots -> " + OUT);
