// 订单详情 + 退款流程巡检
// 用法：QA_ORDER=ORD20260917000000 node scripts/qa/qa-order.mjs
// ⚠ 参数是业务编号 orderNumber（ORD 开头，见订单列表/DB orders."orderNumber"），
//   不是 Prisma id（cuid）——传 id 会得到预期中的 404。
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = "/tmp/shots-order";
mkdirSync(OUT, { recursive: true });
const ORDER = process.env.QA_ORDER || process.argv[2];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const api = ctx.request;
await api.get(BASE + "/api/auth/csrf");
const csrf = (await ctx.cookies()).find((c) => /csrf/i.test(c.name))?.value || "";
await api.post(BASE + "/api/auth/login", {
  data: { email: "user@example.com", password: "User@123456" },
  headers: { "x-csrf-token": csrf },
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));

await page.goto(`${BASE}/orders/${ORDER}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/order-detail.png`, fullPage: true });
const t = await page.evaluate(() => document.body.innerText);
console.log("订单详情文本:\n" + t.replace(/\n+/g, " | ").slice(0, 700));
// 检查物流入口是否已移除（不应再出现「查询物流轨迹 / Track shipment」外链）
console.log("\n物流外链是否残留:", /查询物流轨迹|Track shipment/.test(t) ? "❌ 仍存在" : "✅ 已移除");

// 退款入口
const refundBtn = page.getByRole("button", { name: /refund|退款/i }).first();
if (await refundBtn.count()) {
  await refundBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/refund-form.png`, fullPage: true });
  const formText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("\n退款弹窗片段:", formText.replace(/\n+/g, " | ").slice(0, 400));
} else {
  console.log("\n未找到退款按钮");
}

console.log("\npageerror:", errs.length ? errs.join(" || ") : "无");
await browser.close();
console.log("shots -> " + OUT);
