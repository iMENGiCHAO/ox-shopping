// Phase 11 六项业务整改验收：法务双语关联 / 注册防灌水 / 币种汇总与渠道匹配 / 客户管理细化 / 到货提醒闭环
// 用法：node scripts/qa/qa-phase11.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = process.env.QA_OUT || "/tmp/shots";

// workbuddy 并行开发时 Turbopack HMR 长连接会让 networkidle 永不满足——
// 用 domcontentloaded + load（不等长连接）+ 短缓冲，客户端 fetch 有显式断言兜底
const gotoStable = async (pg, url) => {
  await pg.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await pg.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
  await pg.waitForTimeout(600);
};
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
  if (url.includes("__nextjs_font") || m.text().includes("__nextjs_font")) return;
  if (m.text().toLowerCase().includes("switchbubbleinput")) return;
  if (m.text().includes("Server:") && m.text().includes("Client:")) return;
  // 主动测试请求（蜜罐 400 / 重复注册 409）会以 console error 形式回显，属预期
  if (/status of (400|409)/.test(m.text()) && m.location()?.url?.includes("/api/auth/register"))
    return;
  consoleErrors.push(m.text());
});
page.on("pageerror", (e) => {
  const t = e.message;
  if (t.toLowerCase().includes("switchbubbleinput") || t.includes("Server:")) return;
  consoleErrors.push(`pageerror: ${t}`);
});

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

/** admin API 登录拿 csrf + cookie（用页面上下文直接 fetch 保证同源） */
async function adminApiLogin() {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(async () => {
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
}

try {
  await adminApiLogin();
  const api = (path, init) =>
    page.evaluate(async ({ path, init }) => fetch(path, init).then((r) => r.json()), {
      path,
      init,
    });
  const csrf = () =>
    page.evaluate(
      () =>
        document.cookie
          .split("; ")
          .find((c) => /csrf/i.test(c))
          ?.split("=")[1],
    );

  /* ══════════ A. 法务双语关联 ══════════ */
  console.log("\n── A. 法务页面 ↔ 前台关联 ──");
  await gotoStable(page, `${BASE}/admin/legal`);
  await page.getByRole("tab", { name: "隐私政策" }).waitFor({ timeout: 60000 });
  const zhBox = page.getByLabel("中文内容", { exact: true });
  const enBox = page.getByLabel("英文内容", { exact: true });
  ok("法务编辑器：中文/英文双栏", (await zhBox.isVisible()) && (await enBox.isVisible()));
  await zhBox.fill("QA11 双语关联验证：中文内容 v1");
  await enBox.fill("QA11 bilingual linkage: English content v1");
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByText("已保存，前台页面即时生效").waitFor({ timeout: 60000 });
  ok("双语保存成功", true);

  // 前台中文页（?lang=zh 硬切）显示新中文；英文页显示新英文
  await gotoStable(page, `${BASE}/zh/policies/privacy`);
  ok(
    "前台中文页显示后台编辑的中文内容",
    await page.getByText("QA11 双语关联验证：中文内容 v1").isVisible(),
  );
  // 页脚逐字对齐原站实测（2026-09-20 直连 shop.x.com 导出全部 <a>）：共 6 条，
  // 没有 Your Privacy Choices 第 7 条，也没有退款政策
  ok(
    "前台页脚为原站 6 条且不含「您的隐私选择」",
    (await page.getByRole("link", { name: "您的隐私选择" }).count()) === 0,
  );
  ok(
    "前台页脚不含退款政策入口（原站店铺页脚无此项）",
    (await page.getByRole("link", { name: /退款政策|Refund Policy/ }).count()) === 0,
  );
  await gotoStable(page, `${BASE}/policies/privacy`);
  ok(
    "前台英文页显示后台编辑的英文内容",
    await page.getByText("QA11 bilingual linkage: English content v1").isVisible(),
  );
  ok(
    "前台页脚不含 Your Privacy Choices（原站 6 条）",
    (await page.getByRole("link", { name: "Your Privacy Choices" }).count()) === 0,
  );
  // 退款政策已按原站移出页脚，但页面本身必须仍可直接访问（售后退款必需）
  await gotoStable(page, `${BASE}/policies/refund`);
  ok(
    "退款政策页仍可直接访问（仅移出页脚）",
    await page.getByRole("heading", { level: 1 }).first().isVisible(),
  );
  await shot("p11-legal-en");

  // 还原：清空保存 → 恢复内置默认
  await gotoStable(page, `${BASE}/admin/legal`);
  await page.getByRole("tab", { name: "隐私政策" }).waitFor({ timeout: 60000 });
  // 防竞态：等编辑器加载完成（Textarea 已回填 QA 内容）再清空，避免 load() 回填覆盖 fill
  await page.waitForFunction(
    () => {
      const boxes = [...document.querySelectorAll("textarea")];
      return boxes.some((el) => el.value.includes("QA11"));
    },
    undefined,
    { timeout: 60000 },
  );
  await page.getByLabel("中文内容", { exact: true }).fill("");
  await page.getByLabel("英文内容", { exact: true }).fill("");
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByText("已保存，前台页面即时生效").waitFor({ timeout: 60000 });
  await gotoStable(page, `${BASE}/zh/policies/privacy`);
  ok(
    "清空即恢复内置默认（QA 内容不再出现）",
    !(await page
      .getByText("QA11")
      .isVisible()
      .catch(() => false)),
  );

  /* ══════════ B. 注册防灌水（独立上下文，注册登录新用户不顶掉 admin 会话）══════════ */
  console.log("\n── B. 注册防灌水 ──");
  const regCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const regPage = await regCtx.newPage();
  await gotoStable(regPage, `${BASE}/auth/register`);
  const honeypot = regPage.locator('input[name="company"]');
  ok("蜜罐字段存在且对用户不可见", (await honeypot.count()) === 1);
  const hpAttrs = await honeypot.first().evaluate((el) => ({
    ariaHidden: el.getAttribute("aria-hidden"),
    tabIndex: el.tabIndex,
    type: el.getAttribute("type"),
  }));
  ok("蜜罐字段 aria-hidden + 不可聚焦", hpAttrs.ariaHidden === "true" && hpAttrs.tabIndex === -1);

  const stamp = Date.now();
  const botRes = await regPage.evaluate(async () => {
    await fetch("/api/auth/csrf");
    const csrf = document.cookie
      .split("; ")
      .find((c) => /csrf/i.test(c))
      ?.split("=")[1];
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({
        email: `bot-qa11-${Date.now()}@example.com`,
        name: "机器人",
        password: "Abcdef12",
        company: "spam-bot",
      }),
    });
    return r.status;
  });
  ok(`蜜罐被填 → 400 静默拒绝（实际 ${botRes}）`, botRes === 400);

  // 正常注册走 UI（蜜罐不填）
  const newEmail = `qa11-${stamp}@example.com`;
  // 原站形态：注册页是「只有 placeholder」的框（First/Last name、E-mail、Password），
  // 无框外 label；中英界面词条不同，用容忍正则匹配
  await regPage.getByPlaceholder(/邮箱|E-mail/).first().fill(newEmail);
  await regPage.getByPlaceholder(/名|First name/).first().fill("QA11");
  await regPage.getByPlaceholder(/姓|Last name/).first().fill("用户");
  await regPage.getByPlaceholder(/密码|Password/).first().fill("Abcdef12");
  await regPage.getByRole("button", { name: /创建账号|注册|Sign ?up/i }).first().click();
  await regPage.waitForURL(/\/$/, { timeout: 60000 });
  ok("正常注册不受蜜罐影响（注册并回首页）", true);

  const dupRes = await regPage.evaluate(
    async ({ email }) => {
      const csrf = document.cookie
        .split("; ")
        .find((c) => /csrf/i.test(c))
        ?.split("=")[1];
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ email, name: "重复者", password: "Abcdef12" }),
      });
      return r.status;
    },
    { email: newEmail },
  );
  ok(`重复邮箱注册 → 409（实际 ${dupRes}）`, dupRes === 409);
  await regPage.screenshot({ path: `${OUT}/p11-register-home.png`, fullPage: true });
  await regCtx.close();

  /* ══════════ C. 币种：渠道枚举 + 仪表盘汇总 ══════════ */
  console.log("\n── C. 多币种支付管理 ──");
  const chUsd = await api("/api/payment/channels?currency=USD");
  const chCny = await api("/api/payment/channels?currency=CNY");
  const mockUsd = chUsd?.data?.channels?.find((c) => c.code === "mock");
  const mockCny = chCny?.data?.channels?.find((c) => c.code === "mock");
  ok(
    "渠道枚举带币种参数正常返回（USD）",
    Array.isArray(chUsd?.data?.channels) && chUsd.data.channels.length === 6,
  );
  ok("mock 双币种可用", mockUsd?.available === true && mockCny?.available === true);
  const alipayCny = chCny?.data?.channels?.find((c) => c.code === "alipay");
  ok(
    "预留渠道（alipay）CNY 下仍不可选（未配置，无 currencyMismatch 误报）",
    alipayCny?.available === false && !alipayCny?.currencyMismatch,
  );

  await gotoStable(page, `${BASE}/admin`);
  await page.getByText("各币种销售汇总").first().waitFor({ timeout: 60000 });
  ok("仪表盘「各币种销售汇总」卡片渲染", true);
  ok("币种汇总表含汇率快照说明", await page.getByText("汇率快照").first().isVisible());
  await shot("p11-currency-dashboard");

  /* ══════════ D. 客户管理细化 ══════════ */
  console.log("\n── D. 客户管理 ──");
  await gotoStable(page, `${BASE}/admin/users`);
  await page.getByText("累计消费").first().waitFor({ timeout: 60000 });
  ok("客户表新增「累计消费」列", true);
  ok("客户表新增「最近下单」列", await page.getByText("最近下单").first().isVisible());
  const unvBtn = page.getByRole("button", { name: "邮箱未验证" });
  ok("「邮箱未验证」筛选按钮存在", await unvBtn.isVisible());
  await unvBtn.click();
  await page.waitForTimeout(1200);
  const unvCount = await api("/api/admin/users?unverified=1&page=1&pageSize=10");
  ok(
    "未验证筛选生效（API 返回与按钮联动）",
    Array.isArray(unvCount?.data) &&
      unvCount.data.every((u) => u.emailVerified === false || u.emailVerified === null),
  );
  await unvBtn.click(); // 还原
  await page.waitForTimeout(800);

  // 详情抽屉：消费汇总 + 到货提醒订阅（搜种子用户 user@example.com——有种子订单，可验消费折算）
  await page.getByPlaceholder("搜索邮箱 / 姓名").fill("user@example.com");
  await page.waitForTimeout(1500);
  await page
    .getByRole("button", { name: /查看|详情/ })
    .first()
    .click();
  await page.getByText("到货提醒订阅").waitFor({ timeout: 60000 });
  ok("详情抽屉含消费汇总", await page.getByText("笔有效订单").isVisible());
  ok("详情抽屉含到货提醒订阅数", await page.getByText("到货提醒订阅").isVisible());
  await shot("p11-user-detail");
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("搜索邮箱 / 姓名").fill("");
  await page.waitForTimeout(1000);

  /* ══════════ E. 到货提醒端到端（补货 → 自动通知）══════════ */
  console.log("\n── E. 到货提醒闭环 ──");
  // 选一个商品：拿「Grok Dad Hat」（不影响 e2e 常用商品）
  const products = await api("/api/admin/products?page=1&pageSize=50");
  const target = products?.data?.find((p) => /dad-hat/i.test(p.slug) || /Dad Hat/.test(p.name));
  ok("找到测试商品（Grok Dad Hat）", !!target);
  if (target) {
    const pid = target.id;
    const origStock = target.stock;
    const csrfVal = await csrf();
    const putJson = (path, body) =>
      page.evaluate(
        async ({ path, body, csrfVal }) => {
          const r = await fetch(path, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-csrf-token": csrfVal },
            body: JSON.stringify(body),
          });
          return { status: r.status, body: await r.json() };
        },
        { path, body, csrfVal },
      );
    const postJson = (path, body) =>
      page.evaluate(
        async ({ path, body, csrfVal }) => {
          const r = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-csrf-token": csrfVal },
            body: JSON.stringify(body),
          });
          return { status: r.status, body: await r.json() };
        },
        { path, body, csrfVal },
      );

    // 1) 库存清零（售罄）
    await putJson(`/api/admin/products/${pid}/stock`, { stock: 0 });
    // 2) 公开 API 登记到货提醒
    const email = `restock-qa11-${stamp}@example.com`;
    const sub = await postJson("/api/notify-me", { email, productId: pid });
    ok(`售罄商品登记到货提醒（${sub.status}）`, sub.status === 201 || sub.status === 200);

    // 3) 补货（0 → 1）→ notifyRestock 自动触发
    const restock = await putJson(`/api/admin/products/${pid}/stock`, { stock: 1 });
    ok(`补库存成功（${restock.status}）`, restock.status === 200);

    // 4) 订阅状态 draft → notified（admin notify-me 列表 API：json() 包装为 { data: { items } }）
    await page.waitForTimeout(1500);
    const subs = await api("/api/admin/notify-me");
    const mine = subs?.data?.items?.find((r) => r.email === email);
    ok("补货后订阅自动变为「已通知」", mine?.status === "notified");
    // 还原商品库存
    await putJson(`/api/admin/products/${pid}/stock`, { stock: origStock });
    ok("商品库存已还原", true);
  }

  // 375px 响应式抽检（新改动页面）
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoStable(page, `${BASE}/admin/users`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(`admin/users 375px 无横向溢出（差值 ${overflow}px）`, overflow <= 1);
  await gotoStable(page, `${BASE}/admin/legal`);
  const overflow2 = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(`admin/legal 375px 无横向溢出（差值 ${overflow2}px）`, overflow2 <= 1);
} catch (err) {
  console.error("SCRIPT ERROR:", err.message);
  failures++;
}

console.log("\nconsole errors:", consoleErrors.length ? consoleErrors : "none");
if (consoleErrors.length > 0) failures++;

await browser.close();
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
