// 物流方式管理页 QA：新对话框创建/编辑/启停/删除全流程 + 截图 + 控制台错误捕获 + 375px 响应式
// 用法：node scripts/qa/qa-shipping.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = process.env.QA_OUT || "/tmp/shots";
mkdirSync(OUT, { recursive: true });

const ts = Date.now();
const name = `QA 物流 ${ts}`;
const code = `qa-ship-${ts}`;

let failures = 0;
const ok = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
/** 已记录在案的 dev-only 噪音（findings.md）：Next 字体 404 + Radix Switch SSR 样式串/数差异 */
const isKnownNoise = (text) =>
  text.includes("__nextjs_font") ||
  text.toLowerCase().includes("switchbubbleinput") ||
  (text.includes("Server:") && text.includes("Client:"));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url ?? "";
  // 已记录在案的 dev-only 噪音（findings.md）：Next dev 字体 404 + Radix Switch SSR 样式串/数差异
  if (url.includes("__nextjs_font") || m.text().includes("__nextjs_font")) return;
  if (m.text().toLowerCase().includes("switchbubbleinput")) return;
  if (m.text().includes("Server:") && m.text().includes("Client:")) return;
  if (m.text().startsWith("Failed to load resource") && url.includes("/_next/")) return;
  consoleErrors.push(m.text());
});
page.on("pageerror", (e) => {
  const t = `pageerror: ${e.message}`;
  if (!isKnownNoise(t) && !t.includes("Hydration")) consoleErrors.push(t);
});

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

/** 记录 shipping-methods API 的请求/响应（诊断创建超时） */
page.on("response", (res) => {
  if (res.url().includes("/api/admin/shipping-methods")) {
    console.log(`[api] ${res.request().method()} ${res.url().split("/api/")[1]} → ${res.status()}`);
  }
});

try {
  // ── 登录 ──
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByLabel("邮箱").fill("admin@example.com");
  await page.getByLabel("密码").fill("Admin@123456");
  await page.getByRole("button", { name: /登录/ }).click();
  await page.waitForURL(/\/admin$/, { timeout: 60000 });

  // ── 列表页 ──
  await page.goto(`${BASE}/admin/shipping`, { waitUntil: "networkidle", timeout: 120000 });
  await shot("shipping-list");
  ok("页头渲染", await page.getByRole("heading", { name: "物流方式" }).isVisible());
  ok(
    "说明文字渲染",
    await page.getByText(/前台结账页按「排序」/).isVisible(),
  );
  ok("新建按钮存在", await page.getByRole("button", { name: "新建物流方式" }).isVisible());
  const rowCount = await page.locator("tbody tr").count();
  ok(`列表有数据行（${rowCount} 行）`, rowCount > 0);

  // ── 创建对话框 ──
  await page.getByRole("button", { name: "新建物流方式" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 15000 });
  await shot("shipping-create-dialog");
  ok("对话框标题", await dialog.getByRole("heading", { name: "新建物流方式" }).isVisible());
  ok("快速模板组", await dialog.getByRole("group", { name: "快速模板" }).isVisible());
  ok(
    "默认套用标准物流模板",
    (await dialog.getByRole("button", { name: /标准物流/ }).getAttribute("aria-pressed")) ===
      "true",
  );
  ok(
    "模板预填中文名",
    (await dialog.getByLabel("显示名（中文）").inputValue()) === "标准物流",
  );

  // 套用「货到付款」模板 → 表单联动
  await dialog.getByRole("button", { name: /货到付款/ }).click();
  ok(
    "套用到付模板（开关联动）",
    await dialog
      .getByText("开启后该方式运费不计入订单总额，由顾客收货时向快递员支付。")
      .isVisible(),
  );
  ok(
    "预览显示到付徽标",
    await dialog
      .getByLabel("结账页预览")
      .locator("span.text-warning", { hasText: "货到付款" })
      .isVisible(),
  );
  // 切回标准模板（非到付），后续验证运费展示
  await dialog.getByRole("button", { name: /标准物流/ }).click();

  // 英文名 → 代号自动生成
  await dialog.getByLabel("显示名（中文）").fill(name);
  await dialog.locator("#sm-name-en").fill("Qa Express Dragon");
  const autoCode = await dialog.locator("#sm-code").inputValue();
  ok(`代号自动生成（${autoCode}）`, autoCode === "qa-express-dragon");

  // 改运费/门槛 → 预览联动
  await dialog.locator("#sm-code").fill(code);
  await dialog.locator("#sm-fee").fill("15.5");
  await dialog.locator("#sm-free-over").fill("99");
  await shot("shipping-create-filled");
  ok(
    "预览免邮提示联动",
    await dialog.getByLabel("结账页预览").getByText("订单满 $99.00 免运费").isVisible(),
  );
  ok(
    "预览运费联动",
    await dialog.getByLabel("结账页预览").getByText("$15.50").isVisible(),
  );

  // 提交
  await dialog.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByText("物流方式已创建").waitFor({ timeout: 30000 });
  ok("创建成功 toast", true);
  const row = page.getByRole("row").filter({ hasText: code });
  await row.waitFor({ timeout: 15000 });
  ok("列表出现新行", await row.isVisible());
  ok("行内运费显示", (await row.textContent()).includes("$15.50"));
  await shot("shipping-after-create");

  // ── 编辑 ──
  await row.getByRole("button", { name: `编辑 ${name}` }).click();
  await dialog.getByRole("heading", { name: `编辑物流方式 — ${name}` }).waitFor({
    timeout: 15000,
  });
  await shot("shipping-edit-dialog");
  ok("编辑模式代号只读", (await dialog.locator("#sm-code").getAttribute("readonly")) !== null);
  await dialog.locator("#sm-fee").fill("7.77");
  await dialog.getByRole("button", { name: "保存修改" }).click();
  // 诊断：若校验失败，行内错误会渲染在对话框里
  await page.waitForTimeout(2500);
  const formErrs = await dialog.locator("p.text-xs.text-destructive").allInnerTexts();
  if (formErrs.length) console.log("dialog form errors:", JSON.stringify(formErrs));
  await page.getByText("物流方式已保存").waitFor({ timeout: 30000 });
  ok("编辑保存 toast", true);
  await row.waitFor();
  ok("行内运费已更新", ((await row.textContent()) ?? "").includes("$7.77"));

  // ── 启停 ──
  await row.getByRole("switch", { name: `停用 ${name}` }).click();
  await page.getByText(`「${name}」已停用，前台结账页不再显示`).waitFor({ timeout: 30000 });
  ok("停用 toast", true);
  await row.getByRole("switch", { name: `启用 ${name}` }).click();
  await page.getByText(`「${name}」已启用`).waitFor({ timeout: 30000 });
  ok("启用 toast", true);

  // ── 删除（确认弹窗） ──
  await row.getByRole("button", { name: `删除 ${name}` }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("heading", { name: "删除物流方式" }).waitFor({ timeout: 15000 });
  await shot("shipping-delete-confirm");
  ok(
    "确认弹窗提示未被订单使用",
    (await confirm.textContent()).includes("尚未被任何订单使用"),
  );
  await confirm.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByText(`「${name}」已删除`).waitFor({ timeout: 30000 });
  ok("删除成功且行消失", (await page.getByRole("row").filter({ hasText: code }).count()) === 0);

  // ── 375px 响应式 ──
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}/admin/shipping`, { waitUntil: "networkidle", timeout: 120000 });
  await shot("shipping-mobile-list");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(`375px 无横向溢出（差值 ${overflow}px）`, overflow <= 1);
  await page.getByRole("button", { name: "新建物流方式" }).click();
  await dialog.waitFor({ timeout: 15000 });
  await shot("shipping-mobile-create-dialog");
  const dialogOverflow = await page.evaluate(() => {
    const d = document.querySelector("[role='dialog']");
    if (!d) return 999;
    const r = d.getBoundingClientRect();
    return Math.max(0, r.right - window.innerWidth, 0 - r.left);
  });
  ok(`375px 对话框不出界（差值 ${dialogOverflow}px）`, dialogOverflow <= 1);
} catch (err) {
  console.error("SCRIPT ERROR:", err.message);
  failures++;
}

console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
if (consoleErrors.length > 0) failures++;

await browser.close();
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
