// 到货提醒闭环：订阅 → 后台列表应渲染该行 → 清理
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE = "http://localhost:3000";
const OUT = "/tmp/shots-notify";
mkdirSync(OUT, { recursive: true });
const EMAIL = "qa-notify-ui@example.com";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const api = ctx.request;

// admin 登录
await api.get(BASE + "/api/auth/csrf");
let csrf = (await ctx.cookies()).find((c) => /csrf/i.test(c.name))?.value || "";
await api.post(BASE + "/api/auth/login", {
  data: { email: "admin@example.com", password: "Admin@123456", scope: "admin" },
  headers: { "x-csrf-token": csrf },
});

// 取一个商品
const prods = await api.get(BASE + "/api/products?page=1&pageSize=1");
const pj = await prods.json();
const pid = (pj.data?.[0] || pj.products?.[0] || {}).id;
console.log("productId:", pid);

// 游客订阅
const sub = await api.post(BASE + "/api/notify-me", { data: { email: EMAIL, productId: pid } });
console.log("订阅:", sub.status(), (await sub.text()).slice(0, 120));

// 后台页渲染
const page = await ctx.newPage();
await page.goto(BASE + "/admin/notify-me", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/admin-notify-me.png`, fullPage: true });
const found = await page.evaluate((e) => document.body.innerText.includes(e), EMAIL);
const rowCount = await page.evaluate(
  () => document.querySelectorAll("table tbody tr, [data-testid='notify-row']").length,
);
console.log("后台页面含该邮箱:", found, "| 行数:", rowCount);

await browser.close();
console.log("shot -> " + OUT);
