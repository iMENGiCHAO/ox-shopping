// 端到端：登录 → 加购 → 结算 → 模拟支付 → 订单结果 → 我的订单
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = "/tmp/shots-e2e";
mkdirSync(OUT, { recursive: true });
const SLUG = process.env.QA_SLUG || "macrohard-remove-before-flight-keychain";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const api = ctx.request;

// 1) 登录（用户）
await api.get(BASE + "/api/auth/csrf");
const csrf = (await ctx.cookies()).find((c) => /csrf/i.test(c.name))?.value || "";
const login = await api.post(BASE + "/api/auth/login", {
  data: { email: "user@example.com", password: "User@123456" },
  headers: { "x-csrf-token": csrf },
});
console.log("1. 登录:", login.status());

const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => {
  if (m.type() === "error") errs.push(m.text().slice(0, 160));
});

// 2) 商品页加入购物车
await page.goto(`${BASE}/products/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2000);
const addBtn = page.getByRole("button", { name: /add to cart/i }).first();
await addBtn.click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/1-add-to-cart.png` });
console.log("2. 加入购物车: ok");

// 3) 结算页
await page.goto(`${BASE}/checkout`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/2-checkout.png`, fullPage: true });
const checkoutText = await page.evaluate(() => document.body.innerText.slice(0, 600));
console.log("3. 结算页文本片段:\n" + checkoutText.replace(/\n+/g, " | ").slice(0, 500));

// 选支付渠道（若存在可选渠道）
try {
  const mockRadio = page.locator('input[type="radio"][value="mock"]').first();
  if (await mockRadio.count()) {
    await mockRadio.check({ force: true });
    await page.waitForTimeout(400);
    console.log("   已选支付渠道: mock");
  }
} catch {
  console.log("   支付渠道选择跳过");
}

// 4) 提交订单
const placeBtn = page.getByRole("button", { name: /place order/i }).first();
await placeBtn.click();
await page.waitForTimeout(10000);
await page.screenshot({ path: `${OUT}/3-after-place.png`, fullPage: true });
const urlAfter = page.url();
console.log("4. 提交后 URL:", urlAfter);

// 5) 模拟支付
if (urlAfter.includes("/checkout/mock/")) {
  const payBtn = page.getByRole("button", { name: /mock payment successful/i }).first();
  await payBtn.click();
  await page.waitForTimeout(18000);
  await page.screenshot({ path: `${OUT}/4-after-pay.png`, fullPage: true });
  console.log("5. 模拟支付后 URL:", page.url());
  const resultText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log("   结果页片段:", resultText.replace(/\n+/g, " | ").slice(0, 300));
} else {
  console.log("5. 未进入模拟支付页（URL 不符）");
}

// 6) 我的订单
await page.goto(`${BASE}/orders`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/5-orders.png`, fullPage: true });
const ordersText = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log("6. 订单列表片段:", ordersText.replace(/\n+/g, " | ").slice(0, 400));

console.log("\nconsole 错误:", errs.length ? [...new Set(errs)].slice(0, 3).join(" || ") : "无");
await browser.close();
console.log("shots -> " + OUT);
