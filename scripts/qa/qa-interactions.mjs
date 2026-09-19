// 核心交互测试：快速加购→购物车抽屉、搜索联想、币种下拉
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE = "http://localhost:3000";
const OUT = "/tmp/shots-inter";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

// 1) 登录（便于加购）
const api = ctx.request;
await api.get(BASE + "/api/auth/csrf");
const csrf = (await ctx.cookies()).find((c) => /csrf/i.test(c.name))?.value || "";
await api.post(BASE + "/api/auth/login", {
  data: { email: "user@example.com", password: "User@123456" },
  headers: { "x-csrf-token": csrf },
});

// 2) 首页 hover 商品卡 → 快速加购
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2500);
const card = page.locator('a[href*="/products/"]').first();
const box = await card.boundingBox();
if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/1-card-hover.png` });
const quickAdd = page.locator("button").filter({ hasText: /add|bag|cart|\+/i });
console.log("首页商品卡数量:", await page.locator('a[href*="/products/"]').count());
console.log("hover 后可见按钮数:", await page.locator("button:visible").count());

// 3) 直接点商品卡进入 PDP，验证加购 → 抽屉
await card.click();
await page.waitForTimeout(3000);
const addBtn = page.getByRole("button", { name: /add to cart/i }).first();
if (await addBtn.count()) {
  await addBtn.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/2-after-add.png` });
  const drawerVisible = await page.evaluate(() => {
    const t = document.body.innerText;
    return /Your Bag|Shopping Bag|购物袋|View Full Bag|去结算|Checkout/i.test(t);
  });
  console.log("加购后抽屉可见:", drawerVisible);
} else {
  console.log("PDP 未找到加购按钮");
}

// 4) 搜索联想
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2000);
await page.getByRole("button", { name: /search/i }).first().click().catch(() => {});
await page.waitForTimeout(1200);
await page.keyboard.type("tee", { delay: 80 });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/3-search.png` });
const searchText = await page.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 200));
console.log("搜索后文本:", searchText);

console.log("pageerror:", errs.length ? errs.join(" || ") : "无");
await browser.close();
console.log("shots -> " + OUT);
