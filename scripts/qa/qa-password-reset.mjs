// B-2 验收：原站式找回密码（用户申请 → 后台待处理 → 管理员批准 → 邮件发强随机临时密码 → 首登强制改密）
// 覆盖：防枚举回执 / 后台通知与待处理列表 / 批准下发临时密码 / 旧密码失效 /
//       中间件强制改密门控（页面 307 + 接口 403）/ 改密后恢复正常 / 驳回分支 / 清理测试账号
// 用法：node scripts/qa/qa-password-reset.mjs   （需 dev server 已启动）
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
const userCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const user = await userCtx.newPage();
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const admin = await adminCtx.newPage();

for (const p of [user, admin]) {
  p.on("console", (m) => {
    const t = m.text();
    if (m.type() !== "error") return;
    // React 的水合属性差异是**分条**打印的：主告警一条，Server/Client 差异另一条。
    // 主告警单独出现时看不出差在哪个属性，这里把差异条一并打出（不单独计 FAIL）。
    if (t.includes("Server:") && t.includes("Client:")) {
      console.log(`    diff: ${t.replace(/\n/g, "\n          ").slice(0, 1200)}`);
      return;
    }
    if (
      !t.includes("__nextjs_font") &&
      // 预期内的拒绝回显（强制改密 403 / 旧密码 401）
      !/status of (400|401|403|404|409)/.test(t)
    ) {
      ok(`console error: ${t.slice(0, 120)}`, false);
      console.log(`    full: ${t.slice(0, 1500).replace(/\n/g, "\n          ")}`);
    }
  });
  p.on("pageerror", (e) => {
    if (!e.message.includes("Server:")) ok(`pageerror: ${e.message.slice(0, 120)}`, false);
  });
}

/**
 * 截图（先等页面稳定）。
 *
 * 为什么要等：Playwright 的 `fullPage` 截图会给页面元素注入临时 `style` 属性。
 * 如果截屏发生在 React 水合**完成之前**，React 随后比对 DOM 时会看到这个多出来的
 * 属性，于是误报 "A tree hydrated but some attributes ... didn't match"。
 * 实测（本地复现）：落地后立刻整页截图 → 100% 假告警；等水合完成再截 → 0 告警。
 * 这是测试夹具时序问题，不是产品缺陷，所以修在脚本这一层。
 */
const shot = async (name, page) => {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
  return page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};

/**
 * 预置 CSRF cookie：proxy 只在 /api 的 GET 上补发 csrf_token，
 * 页面导航不会自动带上；页面内 fetch 直接调接口前必须先取一次。
 */
/**
 * 提交找回密码申请（带限流自愈）。
 *
 * dev server 的限流是**进程内固定窗口**（单 IP 3 次/分钟）：连续多轮 QA 会撞上
 * 429，此时页面不会出现成功回执。这里等一个窗口（65s）重试一次，
 * 否则「重复跑 QA」会变成一条假失败（历史上多次踩过同类坑）。
 */
async function submitForgot(page, email) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto(`${BASE}/auth/forgot-password`, { waitUntil: "networkidle", timeout: 120000 });
    await page.getByPlaceholder("E-mail").fill(email);
    await page.getByRole("button", { name: "Recover" }).click();
    try {
      await page.getByTestId("recover-sent").waitFor({ timeout: 20000 });
      return (await page.getByTestId("recover-sent").innerText()).trim();
    } catch (err) {
      if (attempt === 2) throw err;
      console.log("   [retry] 未出现成功回执（疑似限流），等待 65s 后重试");
      await page.waitForTimeout(65000);
    }
  }
  throw new Error("unreachable");
}

const primeCsrf = (page) => page.evaluate(() => fetch("/api/auth/csrf").catch(() => {}));

const stamp = Date.now();
const qaEmail = `qa-b2-${stamp}@example.com`;
const OLD_PASSWORD = "User@123456";
const NEW_PASSWORD = "NewPass@2026";
let tempPassword = "";
let targetUserId = null;

/** 走 UI 登录（shop） */
async function loginUi(page, email, password, { expectForced = false } = {}) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByPlaceholder("E-mail").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  if (expectForced) {
    await page.waitForURL(/\/auth\/change-password/, { timeout: 60000 });
  } else {
    await page.waitForURL((u) => !u.pathname.includes("/auth/"), { timeout: 60000 });
  }
}

try {
  /* ═══ A. 准备：注册临时用户，拿到 id（供清理），随后登出 ═══ */
  console.log("\n── A. 准备测试账号 ──");
  // 注册页是「只有 placeholder」的原站形态（无框外 label），选择器必须用 placeholder
  await user.goto(`${BASE}/auth/register`, { waitUntil: "networkidle", timeout: 120000 });
  await user.getByPlaceholder("First name").fill("QA");
  await user.getByPlaceholder("Last name").fill("B2Recover");
  await user.getByPlaceholder("E-mail").fill(qaEmail);
  await user.getByPlaceholder("Password").fill(OLD_PASSWORD);
  await user.getByRole("button", { name: "Sign up" }).click();
  await user.waitForURL((u) => !u.pathname.includes("/auth/"), { timeout: 60000 });
  ok("临时用户注册并登录", true);

  // 管理员登录 + 取用户 id + 登出用户
  // 管理员登录用会话注入（与 qa-phase12 同一约定）：后台登录 UI 本身由 E2E 覆盖，
  // QA 关注的是业务闭环，避免被 UI 文案/语言差异拖成不确定
  await admin.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const adminLoginStatus = await admin.evaluate(async () => {
    await fetch("/api/auth/csrf");
    const csrf = document.cookie
      .split("; ")
      .find((c) => /csrf/i.test(c))
      ?.split("=")[1];
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "Admin@123456",
        scope: "admin",
      }),
    });
    return res.status;
  });
  ok("管理员登录后台", adminLoginStatus === 200);

  targetUserId = await admin.evaluate(async (email) => {
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(email)}&pageSize=5`);
    const body = await res.json();
    return body?.data?.find?.((u) => u.email === email)?.id ?? null;
  }, qaEmail);
  ok("通过后台用户列表取到测试账号 id", !!targetUserId);

  await user.goto(`${BASE}/auth/login`, { waitUntil: "networkidle", timeout: 120000 });
  await primeCsrf(user);
  await user.evaluate(() =>
    fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "x-csrf-token": document.cookie
          .split("; ")
          .find((c) => /csrf/i.test(c))
          ?.split("=")[1],
      },
    }),
  );
  ok("用户已登出（模拟「忘记密码」场景）", true);

  /* ═══ B. 用户提交找回密码申请 ═══ */
  console.log("\n── B. 用户提交申请（防枚举回执）──");
  const sentText = await submitForgot(user, qaEmail);
  ok("提交后展示「申请已提交，等待管理员审核」", /管理员|administrator/i.test(sentText));
  await shot("b2-user-requested", user);

  // 防枚举：未注册邮箱回执与已注册完全一致
  const anonCtx = await browser.newContext();
  const anon = await anonCtx.newPage();
  const anonText = await submitForgot(anon, `nobody-${stamp}@example.com`);
  ok("未注册邮箱与已注册邮箱回执逐字一致（防枚举）", anonText === sentText);
  await anonCtx.close();

  /* ═══ C. 后台待处理列表 ═══ */
  console.log("\n── C. 后台待处理列表 ──");
  await admin.goto(`${BASE}/admin/password-resets`, { waitUntil: "networkidle", timeout: 120000 });
  await admin.getByText(qaEmail).first().waitFor({ timeout: 60000 });
  ok("待处理列表出现该申请", true);
  const pendingBadge = await admin.getByText("待处理").first().isVisible();
  ok("状态徽标显示「待处理」", pendingBadge);
  ok(
    "后台侧栏出现「找回密码」入口",
    await admin.locator('a[href="/admin/password-resets"]').first().isVisible(),
  );
  await shot("b2-admin-pending", admin);

  /* ═══ D. 批准 → 一次性明文临时密码 ═══ */
  console.log("\n── D. 批准并下发临时密码 ──");
  admin.on("dialog", (d) => void d.accept());
  await admin.getByRole("button", { name: "查看详情" }).first().click();
  await admin.getByRole("button", { name: /批准并下发临时密码/ }).click();
  const tempEl = admin.getByTestId("temp-password-value");
  await tempEl.waitFor({ timeout: 60000 });
  tempPassword = (await tempEl.innerText()).trim();
  ok("批准后弹窗展示临时密码（一次性明文）", tempPassword.length >= 8 && !/\s/.test(tempPassword));
  ok(
    "临时密码满足强度（含大写/小写/数字/符号）",
    /[A-Z]/.test(tempPassword) &&
      /[a-z]/.test(tempPassword) &&
      /[0-9]/.test(tempPassword) &&
      /[!@#$%^&*]/.test(tempPassword),
  );
  await shot("b2-admin-temp-password", admin);
  await admin.getByRole("button", { name: "我已记录" }).click();

  const rowStatus = await admin.getByText("已批准").first().isVisible();
  ok("列表状态刷新为「已批准」", rowStatus);

  /* ═══ E. 旧密码失效 + 临时密码首登被强制改密 ═══ */
  console.log("\n── E. 首登强制改密门控 ──");
  const oldLogin = await user.evaluate(
    async ({ email, password }) => {
      const csrf = document.cookie
        .split("; ")
        .find((c) => /csrf/i.test(c))
        ?.split("=")[1];
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ email, password }),
      });
      return res.status;
    },
    { email: qaEmail, password: OLD_PASSWORD },
  );
  ok("旧密码登录被拒（401）", oldLogin === 401);

  await loginUi(user, qaEmail, tempPassword, { expectForced: true });
  ok("临时密码登录后被强制跳转改密页", /\/auth\/change-password/.test(user.url()));
  await shot("b2-forced-change-page", user);

  // 中间件门控：试图回首页会被弹回改密页
  await user.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  ok("改密前访问首页被 307 弹回改密页", /\/auth\/change-password/.test(user.url()));

  // 业务接口 403 PASSWORD_CHANGE_REQUIRED
  const blocked = await user.evaluate(async () => {
    const res = await fetch("/api/user/profile");
    const body = await res.json().catch(() => ({}));
    return { status: res.status, code: body?.error?.code };
  });
  ok(
    "改密前业务接口返回 403 PASSWORD_CHANGE_REQUIRED",
    blocked.status === 403 && blocked.code === "PASSWORD_CHANGE_REQUIRED",
  );

  // 改密前不能改昵称等（同一门控），但改密接口自身放行
  const profilePut = await user.evaluate(async () => {
    const csrf = document.cookie
      .split("; ")
      .find((c) => /csrf/i.test(c))
      ?.split("=")[1];
    const res = await fetch("/api/user/profile", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ name: "不该成功的改名" }),
    });
    return res.status;
  });
  ok("改密前写接口同样被拦（403）", profilePut === 403);

  /* ═══ F. 完成改密 → 恢复正常 ═══ */
  console.log("\n── F. 改密并恢复 ──");
  // 固定走 /zh 前缀，避免默认英文站导致选择器语言漂移；
  // 选择器同时兼容中英两套文案，页面语种怎么变都不会失效
  await user.goto(`${BASE}/zh/auth/change-password`, { waitUntil: "networkidle", timeout: 120000 });
  await user.getByPlaceholder(/临时密码|Temporary password/).fill(tempPassword);
  await user.getByPlaceholder(/请输入新密码|Please enter a new password/).fill(NEW_PASSWORD);
  await user
    .getByPlaceholder(/请再次输入新密码|Please re-enter the new password/)
    .fill(NEW_PASSWORD);
  await user.getByRole("button", { name: /更新密码|Update password/ }).click();
  await user.waitForURL((u) => u.pathname === "/" || u.pathname === "/zh", { timeout: 60000 });
  ok("改密成功后跳回首页（门控解除）", true);

  const afterChange = await user.evaluate(async () => {
    const res = await fetch("/api/auth/me");
    const body = await res.json().catch(() => ({}));
    return { status: res.status, must: body?.data?.user?.mustChangePassword };
  });
  ok("改密后 mustChangePassword=false", afterChange.status === 200 && afterChange.must === false);

  const newLoginStatus = await user.evaluate(
    async ({ email, password }) => {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "x-csrf-token": document.cookie
            .split("; ")
            .find((c) => /csrf/i.test(c))
            ?.split("=")[1],
        },
      });
      const csrf = document.cookie
        .split("; ")
        .find((c) => /csrf/i.test(c))
        ?.split("=")[1];
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ email, password }),
      });
      return res.status;
    },
    { email: qaEmail, password: NEW_PASSWORD },
  );
  ok("新密码可正常登录（200）", newLoginStatus === 200);

  const tempLoginStatus = await user.evaluate(
    async ({ email, password }) => {
      const csrf = document.cookie
        .split("; ")
        .find((c) => /csrf/i.test(c))
        ?.split("=")[1];
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ email, password }),
      });
      return res.status;
    },
    { email: qaEmail, password: tempPassword },
  );
  ok("临时密码改密后立即失效（401）", tempLoginStatus === 401);

  /* ═══ G. 驳回分支 ═══ */
  console.log("\n── G. 驳回分支 ──");
  // 改密后再次提交（走 UI，同样带限流自愈）
  const againText = await submitForgot(user, qaEmail);
  ok("改密后仍可再次提交找回申请", /管理员|administrator/i.test(againText));

  await admin.goto(`${BASE}/admin/password-resets`, { waitUntil: "networkidle", timeout: 120000 });
  await admin.getByText(qaEmail).first().waitFor({ timeout: 60000 });
  await admin.getByRole("button", { name: "查看详情" }).first().click();
  await admin.getByPlaceholder("驳回原因（可选，会随邮件发送给客户）").fill("QA：身份信息不足");
  await admin.getByRole("button", { name: /驳回申请/ }).click();
  await admin.getByText("已驳回").first().waitFor({ timeout: 60000 });
  ok("驳回后列表状态显示「已驳回」", true);
  await shot("b2-admin-rejected", admin);

  const stillWorks = await user.evaluate(
    async ({ email, password }) => {
      const csrf = document.cookie
        .split("; ")
        .find((c) => /csrf/i.test(c))
        ?.split("=")[1];
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ email, password }),
      });
      return res.status;
    },
    { email: qaEmail, password: NEW_PASSWORD },
  );
  ok("驳回后原密码仍可登录（账号未受影响）", stillWorks === 200);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAIL`}`);
} catch (err) {
  failures++;
  console.log(`FAIL: 脚本异常中断 → ${String(err).slice(0, 300)}`);
  try {
    await shot("b2-failure", user);
  } catch {
    /* ignore */
  }
} finally {
  // 清理测试账号（避免污染 dev 库；删除走后台匿名化接口）
  if (targetUserId) {
    try {
      const status = await admin.evaluate(async (id) => {
        const csrf = document.cookie
          .split("; ")
          .find((c) => /csrf/i.test(c))
          ?.split("=")[1];
        const res = await fetch(`/api/admin/users/${id}`, {
          method: "DELETE",
          headers: { "x-csrf-token": csrf },
        });
        return res.status;
      }, targetUserId);
      console.log(`cleanup: 删除测试账号 ${qaEmail} → ${status}`);
    } catch {
      console.log("cleanup: 测试账号删除失败（可忽略，不影响验收结论）");
    }
  }
  await browser.close();
}

process.exit(failures === 0 ? 0 : 1);
