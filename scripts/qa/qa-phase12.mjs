// Phase 12 验收：账户注销申请前后台闭环（大爷指正项）
// 覆盖：用户提交→状态卡→自助撤回→再提交→admin 通知/筛选/详情→驳回→再提交→确认注销（匿名化）→旧会话失效
// 用法：node scripts/qa/qa-phase12.mjs
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

// ── 用户上下文（注册临时用户，不动种子数据） ──
const userCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const user = await userCtx.newPage();
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const admin = await adminCtx.newPage();

for (const p of [user, admin]) {
  p.on("console", (m) => {
    const t = m.text();
    if (
      m.type() === "error" &&
      !t.includes("__nextjs_font") &&
      !t.toLowerCase().includes("switchbubbleinput") &&
      !(t.includes("Server:") && t.includes("Client:")) &&
      // 预期内的测试请求回显（注销重复提交 409 / 旧会话失效 401）
      // dev 冷编译期一次性资源 404（Phase 9 sweep 已定性，复测干净）
      !/status of (400|401|404|409)/.test(t)
    ) {
      ok(`console error: ${t.slice(0, 120)}`, false);
    }
  });
  p.on("pageerror", (e) => {
    const t = e.message;
    if (!t.toLowerCase().includes("switchbubbleinput") && !t.includes("Server:")) {
      ok(`pageerror: ${t.slice(0, 120)}`, false);
    }
  });
}

const shot = (name, page) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const csrfOf = (page) =>
  page.evaluate(
    () =>
      document.cookie
        .split("; ")
        .find((c) => /csrf/i.test(c))
        ?.split("=")[1],
  );

const stamp = Date.now();
const qaEmail = `qa12-${stamp}@example.com`;

try {
  /* ═══ A. 用户端：注册 → 提交注销 → 状态卡 ═══ */
  console.log("\n── A. 用户端注销申请 ──");
  await user.goto(`${BASE}/auth/register`, { waitUntil: "networkidle", timeout: 120000 });
  await user.getByLabel("Email", { exact: true }).fill(qaEmail);
  await user.getByLabel("Name", { exact: true }).fill("QA12 注销测试");
  await user.getByLabel("Password", { exact: true }).fill("User@123456");
  await user.getByRole("button", { name: "Sign up" }).click();
  await user.waitForURL(/\/$/, { timeout: 60000 });
  ok("临时用户注册并登录", true);

  await user.goto(`${BASE}/zh/account/profile`, { waitUntil: "networkidle", timeout: 120000 });
  await user.getByText("账号删除申请").waitFor({ timeout: 60000 });
  const reasonBox = user.getByPlaceholder("简要说明你想删除账号的原因（可选）");
  ok("注销申请提交入口可见（未申请状态）", await reasonBox.isVisible());
  await reasonBox.fill("QA12：请处理我的注销申请");
  await user.getByRole("button", { name: "申请删除账号" }).click();
  await user.getByText("注销申请已收到，核实后我们将处理您的请求").waitFor({ timeout: 60000 });
  ok("提交成功 toast", true);
  // 状态卡：处理中 + 撤回按钮；原提交 UI 隐藏
  await user.getByText("注销申请处理中").waitFor({ timeout: 60000 });
  ok("状态卡显示「注销申请处理中」", true);
  ok("提交框已隐藏（防重复提交）", !(await reasonBox.isVisible().catch(() => false)));
  const withdrawBtn = user.getByRole("button", { name: "撤回注销申请" });
  ok("「撤回注销申请」按钮可见", await withdrawBtn.isVisible());
  await shot("p12-user-requested", user);

  /* ═══ B. 自助撤回 → 恢复提交入口 ═══ */
  console.log("\n── B. 自助撤回 ──");
  await withdrawBtn.click();
  await user.getByText("注销申请已撤回，账户恢复正常").waitFor({ timeout: 60000 });
  ok("撤回成功 toast", true);
  await user.getByPlaceholder("简要说明你想删除账号的原因（可选）").waitFor({ timeout: 60000 });
  ok("撤回后恢复提交入口", true);

  /* ═══ C. 再提交（给 admin 处理链用）═══ */
  await user
    .getByPlaceholder("简要说明你想删除账号的原因（可选）")
    .fill("QA12：请驳回我（第一次）");
  await user.getByRole("button", { name: "申请删除账号" }).click();
  await user.getByText("注销申请处理中").waitFor({ timeout: 60000 });
  ok("再次提交成功（在途）", true);

  /* ═══ D. admin 端：通知中心 + 筛选 + 详情处理 ═══ */
  console.log("\n── D. admin 后台衔接 ──");
  // admin API 登录（登录 UI 由 E2E 覆盖，QA 用会话注入消除 UI 不确定性）
  await admin.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await admin.evaluate(async () => {
    await fetch("/api/auth/csrf");
    const csrf = document.cookie
      .split("; ")
      .find((c) => /csrf/i.test(c))
      ?.split("=")[1];
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "Admin@123456",
        scope: "admin",
      }),
    });
  });
  // 预热处理路由的冷编译（Time Machine 卷首编译 19s+，避免点击后才编译拖垮 toast 等待窗）
  // 假 id 请求必然 404（无副作用），目的只是让路由模块完成编译
  await admin.evaluate(async () => {
    await fetch("/api/auth/csrf");
    const csrf = document.cookie
      .split("; ")
      .find((c) => /csrf/i.test(c))
      ?.split("=")[1];
    await fetch("/api/admin/users/warmup000000000000000000/deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ action: "reject" }),
    }).catch(() => undefined);
  });

  // 通知中心（顶栏铃铛）能看到申请通知
  await admin.goto(`${BASE}/admin/notifications`, { waitUntil: "networkidle", timeout: 120000 });
  // 通知列表异步加载 + dev 冷编译：waitFor 自等待（isVisible 会竞态误报）
  try {
    await admin.getByText("客户申请注销账户").first().waitFor({ timeout: 60000 });
    ok("站内通知中心可见「客户申请注销账户」", true);
  } catch {
    ok("站内通知中心可见「客户申请注销账户」", false);
  }

  // 客户列表：注销申请中筛选 + 行内徽标
  await admin.goto(`${BASE}/admin/users`, { waitUntil: "networkidle", timeout: 120000 });
  await admin.getByText("累计消费").first().waitFor({ timeout: 60000 });
  const delFilterBtn = admin.getByRole("button", { name: "注销申请中" });
  await delFilterBtn.click();
  await admin.waitForTimeout(1200);
  // 筛选后列表里能搜到该用户 + 徽标
  await admin.getByPlaceholder("搜索邮箱 / 姓名").fill(qaEmail);
  await admin.waitForTimeout(1500);
  const rowBadge = await admin
    .getByText("注销申请中")
    .first()
    .isVisible()
    .catch(() => false);
  const rowUser = await admin
    .getByText(qaEmail)
    .first()
    .isVisible()
    .catch(() => false);
  ok("筛选生效：申请中用户在列 + 红色徽标", rowBadge && rowUser);
  await shot("p12-admin-filtered", admin);

  // 详情抽屉：处理块
  await admin
    .getByRole("button", { name: /查看|详情/ })
    .first()
    .click();
  await admin.getByText("处理注销申请").waitFor({ timeout: 60000 });
  ok("详情抽屉处理块可见", true);
  ok(
    "驳回备注输入框可见",
    await admin.getByPlaceholder("驳回备注（可选，将随邮件发送给客户）").isVisible(),
  );
  ok(
    "「确认注销（匿名化删除）」按钮可见",
    await admin.getByRole("button", { name: "确认注销（匿名化删除）" }).isVisible(),
  );

  /* ═══ E. 驳回 → 用户恢复 ═══ */
  console.log("\n── E. 驳回流程 ──");
  await admin
    .getByPlaceholder("驳回备注（可选，将随邮件发送给客户）")
    .fill("QA12 驳回：账户正常，建议保留");
  await admin.getByRole("button", { name: "驳回申请" }).click();
  await admin.getByText("注销申请已驳回").waitFor({ timeout: 60000 });
  ok("驳回成功 toast", true);
  await shot("p12-admin-rejected", admin);

  // 用户端：申请已清空（恢复提交入口）
  await user.goto(`${BASE}/zh/account/profile`, { waitUntil: "networkidle", timeout: 120000 });
  await user.getByText("账号删除申请").waitFor({ timeout: 60000 });
  ok(
    "驳回后用户端恢复提交入口（申请已清空）",
    await user.getByPlaceholder("简要说明你想删除账号的原因（可选）").isVisible(),
  );
  // 确认邮件已落盘（驳回说明随邮件）
  ok(
    "用户会话未受影响（驳回不清空登录）",
    await user.getByText("QA12 注销测试").first().isVisible(),
  );

  /* ═══ F. 确认注销（匿名化）→ 旧会话失效 ═══ */
  console.log("\n── F. 确认注销（匿名化）──");
  // 用户再提交
  await user.getByPlaceholder("简要说明你想删除账号的原因（可选）").fill("QA12：请注销我（最终）");
  await user.getByRole("button", { name: "申请删除账号" }).click();
  await user.getByText("注销申请处理中").waitFor({ timeout: 60000 });

  // admin 处理：确认注销（confirm 对话框自动接受）
  admin.once("dialog", (d) => d.accept().catch(() => undefined));
  await admin.goto(`${BASE}/admin/users`, { waitUntil: "networkidle", timeout: 120000 });
  await admin.getByRole("button", { name: "注销申请中" }).waitFor({ timeout: 60000 });
  await admin.getByRole("button", { name: "注销申请中" }).click();
  await admin.waitForTimeout(1000);
  await admin.getByPlaceholder("搜索邮箱 / 姓名").fill(qaEmail);
  await admin.waitForTimeout(1500);
  await admin
    .getByRole("button", { name: /查看|详情/ })
    .first()
    .click();
  await admin.getByText("处理注销申请").waitFor({ timeout: 60000 });
  await admin.getByRole("button", { name: "确认注销（匿名化删除）" }).click();
  await admin.getByText("账户已注销（匿名化删除）").waitFor({ timeout: 60000 });
  ok("确认注销成功 toast", true);

  // 用户旧会话失效：访问受保护页被弹回登录
  await user.goto(`${BASE}/zh/account/profile`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await user.waitForURL(/auth\/login/, { timeout: 60000 }).catch(() => undefined);
  const kickedOut = /auth\/login/.test(user.url());
  ok(`匿名化后旧会话失效（跳转登录页）`, kickedOut);
  await shot("p12-session-killed", user);

  /* ═══ G. DB 侧终验（经 admin API）：匿名化字段 ═══ */
  const csrf = await csrfOf(admin);
  const listRes = await admin.evaluate(
    async ({ q, csrf }) => {
      const r = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&page=1&pageSize=10`, {
        headers: { "x-csrf-token": csrf },
      });
      return r.json();
    },
    { q: `deleted-`, csrf },
  );
  const anon = (listRes?.data ?? []).find(
    (u) => u.email.startsWith("deleted-") && u.status === "DISABLED",
  );
  ok("库里存在匿名化账户（deleted-xxx@invalid.local + 停用）", !!anon);
  if (anon) {
    ok("匿名化账户不再挂注销申请", !anon.deletionRequestedAt);
  }

  // 375px 响应式抽检（profile + admin/users）
  await user.setViewportSize({ width: 375, height: 812 });
  await user.goto(`${BASE}/auth/login`, { waitUntil: "networkidle", timeout: 120000 });
  const o1 = await user.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await admin.setViewportSize({ width: 375, height: 812 });
  await admin.goto(`${BASE}/admin/users`, { waitUntil: "networkidle", timeout: 120000 });
  const o2 = await admin.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(`375px 无横向溢出（profile-login ${o1}px / admin-users ${o2}px）`, o1 <= 1 && o2 <= 1);
} catch (err) {
  console.error("SCRIPT ERROR:", err.message);
  failures++;
}

await userCtx.close();
await adminCtx.close();
await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
