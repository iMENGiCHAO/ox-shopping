// 支付渠道页 QA：全渠道预留状态 / 三态徽标 / 启用门控 / 前台 available 语义 / 配置与还原
// 用法：node scripts/qa/qa-payment-channels.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = process.env.QA_OUT || "/tmp/shots";
mkdirSync(OUT, { recursive: true });

let failures = 0;
const ok = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url ?? "";
  // dev-only 噪音（findings.md）：Next dev 字体 404 + Radix SSR 串/数差异
  if (url.includes("__nextjs_font") || m.text().includes("__nextjs_font")) return;
  if (m.text().toLowerCase().includes("switchbubbleinput")) return;
  if (m.text().includes("Server:") && m.text().includes("Client:")) return;
  if (m.text().startsWith("Failed to load resource") && url.includes("/_next/")) return;
  consoleErrors.push(m.text());
});
page.on("pageerror", (e) => {
  const t = e.message;
  if (t.toLowerCase().includes("switchbubbleinput") || t.includes("Server:")) return;
  consoleErrors.push(`pageerror: ${t}`);
});

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

try {
  // ── 登录 ──
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByLabel("邮箱").fill("admin@example.com");
  await page.getByLabel("密码").fill("Admin@123456");
  await page.getByRole("button", { name: /登录/ }).click();
  await page.waitForURL(/\/admin$/, { timeout: 60000 });

  // ── 支付渠道页 ──
  await page.goto(`${BASE}/admin/payment-channels`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByText("模拟支付").first().waitFor({ timeout: 30000 }); // 等客户端渠道列表渲染
  await shot("pay-list");
  ok("页头渲染（统一说明）", await page.getByRole("heading", { name: "支付渠道" }).isVisible());

  const CODES = ["mock", "alipay", "wechat", "bankcard", "stripe", "paypal"];
  for (const code of CODES) {
    const li = page.locator("li", { hasText: code }).first();
    ok(`${code} 渠道出现在列表`, await li.isVisible());
  }

  // mock：已配置 + 可收款 + 启用
  const mockLi = page.locator("li", { hasText: "mock" }).first();
  ok("mock 已配置徽标", await mockLi.getByText("已配置", { exact: true }).isVisible());
  ok("mock 可收款徽标", await mockLi.getByText("可收款").isVisible());

  // 预留渠道：未配置徽标 + 未配置描述 + 开关禁用（门控）
  for (const code of ["alipay", "wechat", "bankcard", "stripe", "paypal"]) {
    const li = page.locator("li", { hasText: code }).first();
    ok(`${code} 未配置徽标`, await li.getByText("未配置", { exact: true }).isVisible());
    ok(`${code} 未配置描述语`, await li.getByText("未配置参数（启用前需先填写）").isVisible());
    ok(`${code} 启用开关被禁用（先配置后启用）`, await li.getByRole("switch").isDisabled());
  }

  // ── 前台 API：6 渠道，仅 mock available ──
  const api = await page.evaluate(async () => {
    const r = await fetch("/api/payment/channels", { headers: { Accept: "application/json" } });
    return (await r.json()).data.channels;
  });
  ok("前台枚举 6 个渠道", api.length === 6 && api.map((c) => c.code).join(",") === CODES.join(","));
  ok(
    "前台仅 mock available（预留渠道全部置灰）",
    api
      .filter((c) => c.available)
      .map((c) => c.code)
      .join(",") === "mock",
  );
  ok("前台无密钥泄露", !JSON.stringify(api).includes("secret"));

  // ── 幂等还原：上次中断可能残留 paypal 配置，先清一次保证可重复运行 ──
  const paypalLi = page.locator("li", { hasText: "paypal" }).first();
  const paypalAlready = await paypalLi.getByText("已配置", { exact: true }).first().isVisible();
  if (paypalAlready) {
    await paypalLi.getByRole("button", { name: "编辑" }).click();
    const resetDialog = page.getByRole("dialog");
    await resetDialog.getByRole("heading", { name: "编辑支付渠道" }).waitFor({ timeout: 60000 });
    await resetDialog.getByLabel("Client ID").fill("");
    await resetDialog.getByRole("button", { name: "保存" }).click();
    await page.getByText("支付渠道已更新").waitFor({ timeout: 60000 });
    await paypalLi.getByText("未配置", { exact: true }).first().waitFor({ timeout: 60000 });
  }

  // ── 配置流程：给 paypal 填参数（预留级）──
  await paypalLi.getByRole("button", { name: "编辑" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "编辑支付渠道" }).waitFor({ timeout: 60000 });
  await dialog.getByLabel("Client ID").fill("QA-TEST-CLIENT-ID");
  await dialog.getByLabel("Client Secret").fill("qa-test-secret");
  await dialog.getByRole("button", { name: "保存" }).click();
  await page.getByText("支付渠道已更新").waitFor({ timeout: 60000 });
  ok("paypal 保存成功", true);

  // 配置后：已配置 + 预留徽标（isReady=false）
  await paypalLi.getByText("已配置", { exact: true }).first().waitFor({ timeout: 60000 });
  ok("paypal 已配置徽标", await paypalLi.getByText("已配置", { exact: true }).first().isVisible());
  ok("paypal 预留徽标", await paypalLi.getByText("预留 · 待接入").isVisible());
  ok("paypal 启用开关解禁", (await paypalLi.getByRole("switch").isDisabled()) === false);
  await shot("pay-paypal-configured");

  // ── 启用 paypal（configured → 允许；ready=false → 前台仍置灰）──
  await paypalLi.getByRole("switch").click();
  await page.getByText("已启用", { exact: true }).first().waitFor({ timeout: 60000 });
  ok("paypal 启用成功（服务端门控放行：已配置）", true);

  const api2 = await page.evaluate(async () => {
    const r = await fetch("/api/payment/channels", { headers: { Accept: "application/json" } });
    return (await r.json()).data.channels;
  });
  ok(
    "前台仍仅 mock available（paypal 预留级 enabled 也不可选）",
    api2
      .filter((c) => c.available)
      .map((c) => c.code)
      .join(",") === "mock",
  );
  const paypalApi = api2.find((c) => c.code === "paypal");
  ok("paypal available=false（置灰「暂未开通」）", paypalApi?.available === false);

  // ── 还原：停用 + 清空 Client ID（回到未配置态）──
  await paypalLi.getByRole("switch").click();
  await page.getByText("已停用", { exact: true }).first().waitFor({ timeout: 60000 });
  await paypalLi.getByRole("button", { name: "编辑" }).click();
  await dialog.getByRole("heading", { name: "编辑支付渠道" }).waitFor({ timeout: 60000 });
  await dialog.getByLabel("Client ID").fill("");
  await dialog.getByRole("button", { name: "保存" }).click();
  await page.getByText("支付渠道已更新").waitFor({ timeout: 60000 });
  await paypalLi.getByText("未配置", { exact: true }).first().waitFor({ timeout: 60000 });
  ok("paypal 还原为未配置态", true);
  ok("paypal 开关恢复禁用", await paypalLi.getByRole("switch").isDisabled());
  await shot("pay-restored");

  // ── 375px 响应式 ──
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/admin/payment-channels`, { waitUntil: "networkidle", timeout: 120000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(`375px 无横向溢出（差值 ${overflow}px）`, overflow <= 1);
  await shot("pay-mobile");
} catch (err) {
  console.error("SCRIPT ERROR:", err.message);
  failures++;
}

console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
if (consoleErrors.length > 0) failures++;

await browser.close();
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
