// 验证购物车抽屉登录态提示（logged_in cookie 修复）
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const api = ctx.request;

const p = await ctx.newPage();
await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
console.log("未登录 JS 可见含 logged_in:", (await p.evaluate(() => document.cookie)).includes("logged_in="));

await api.get(BASE + "/api/auth/csrf");
const csrf = (await ctx.cookies()).find((c) => /csrf/i.test(c.name))?.value || "";
await api.post(BASE + "/api/auth/login", {
  data: { email: "user@example.com", password: "User@123456" },
  headers: { "x-csrf-token": csrf },
});
await p.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(1500);
const ck = await p.evaluate(() => document.cookie);
console.log("登录后 JS 可见 cookie:", ck.replace(/csrf_token=[^;]+/, "csrf_token=...").trim());

await p.goto(BASE + "/products/macrohard-remove-before-flight-keychain", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await p.waitForTimeout(3000);
await p.getByRole("button", { name: /add to cart/i }).first().click();
await p.waitForTimeout(3500);
const txt = await p.evaluate(() => document.body.innerText);
console.log("抽屉含「Sign in to track orders」:", /Sign in to track orders/.test(txt));
console.log("抽屉含「track orders / My Orders」:", /track orders|My Orders/i.test(txt));
await b.close();
