// 校验后台面包屑中文标签
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const b = await chromium.launch();
const ctx = await b.newContext();
const api = ctx.request;
await api.get(BASE + "/api/auth/csrf");
const csrf = (await ctx.cookies()).find((c) => /csrf/i.test(c.name))?.value || "";
await api.post(BASE + "/api/auth/login", {
  data: { email: "admin@example.com", password: "Admin@123456", scope: "admin" },
  headers: { "x-csrf-token": csrf },
});
const p = await ctx.newPage();
for (const r of ["/admin", "/admin/payment-channels", "/admin/orders", "/admin/settings"]) {
  await p.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(1200);
  console.log(r.padEnd(28), "=>", (await p.locator("h1").first().textContent())?.trim());
}
await b.close();
