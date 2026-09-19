// 诊断：shipping 列表布局 + payment-channels 页面结构
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle", timeout: 120000 });
await page.getByLabel("邮箱").fill("admin@example.com");
await page.getByLabel("密码").fill("Admin@123456");
await page.getByRole("button", { name: /登录/ }).click();
await page.waitForURL(/\/admin$/, { timeout: 60000 });

await page.goto(`${BASE}/admin/shipping`, { waitUntil: "networkidle", timeout: 120000 });
await page.screenshot({ path: "/tmp/shots/ship-diag-list.png", fullPage: true });

// 所有 heading（查 strict mode 二义来源）
const headings = await page.getByRole("heading").allInnerTexts();
console.log("headings:", JSON.stringify(headings));

// 第一行各列几何（检查重叠）
const geo = await page.evaluate(() => {
  const rows = document.querySelectorAll("tbody tr");
  const r = rows[0];
  if (!r) return "no rows";
  return Array.from(r.querySelectorAll("td")).map((td) => {
    const rect = td.getBoundingClientRect();
    const sw = td.querySelector("[role='switch']");
    const btn = td.querySelector("button");
    return {
      text: (td.textContent || "").trim().slice(0, 12),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      switchRect: sw ? sw.getBoundingClientRect().toJSON() : null,
      firstBtnRect: btn ? btn.getBoundingClientRect().toJSON() : null,
    };
  });
});
console.log("first row cells:", JSON.stringify(geo, null, 1));

await page.goto(`${BASE}/admin/payment-channels`, { waitUntil: "networkidle", timeout: 120000 });
await page.screenshot({ path: "/tmp/shots/pay-diag-list.png", fullPage: true });
const payText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
console.log("--- payment-channels page text ---");
console.log(payText);

await browser.close();
