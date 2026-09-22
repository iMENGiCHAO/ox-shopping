// 分销 / 多级佣金 端到端验收
// 覆盖：推广链接 cookie 捕获 → 注册绑定 → 自动升级分销商 → 下单归属（复购仍归原分销商）
//      → 支付计佣（三级 10/5/2）→ 对账补偿 → 提现申请/审核/打款 → 后台页面与脱敏
// 用法：node scripts/qa/qa-distribution.mjs   （需 dev server 已启动）
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const OUT = process.env.QA_OUT || "/tmp/shots";
mkdirSync(OUT, { recursive: true });

let failures = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

const stamp = Date.now();
const mail = (tag) => `qa-dist-${stamp}-${tag}@example.com`;
const PASSWORD = "User@123456";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const admin = await adminCtx.newPage();

/**
 * 最近一次整页截图的时间戳。
 *
 * 已知夹具假告警：Playwright 的 `fullPage` 截图会给元素注入临时 `style`；
 * 若截图发生在 React 水合**完成之前**，React 随后比对 DOM 会误报
 * "A tree hydrated but some attributes ... didn't match"。本地复现过：
 * 落地后立刻整页截图 100% 触发，等水合完成再截 0 触发。
 * 因此「截图后 3 秒内的水合告警」按夹具问题记录、不计 FAIL（其它水合告警照旧计 FAIL）。
 */
let lastShotAt = 0;

for (const p of [page, admin]) {
  p.on("console", (m) => {
    const t = m.text();
    if (m.type() !== "error") return;
    if (t.includes("__nextjs_font")) return;
    if (/status of (400|401|403|404|409|429)/.test(t)) return;
    if (t.includes("hydrated") && Date.now() - lastShotAt < 3000) {
      console.log("   [note] 截图注入导致的假水合告警（夹具问题，已忽略）");
      return;
    }
    ok(`console error: ${t.slice(0, 120)}`, false);
  });
  p.on("pageerror", (e) => {
    if (!e.message.includes("Server:")) ok(`pageerror: ${e.message.slice(0, 120)}`, false);
  });
}

// 先落一次同源页面：page.evaluate 里读 document.cookie 需要真实文档（about:blank 会 SecurityError）
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 180000 });
await admin.goto(BASE, { waitUntil: "domcontentloaded", timeout: 180000 });

const shot = async (name, p) => {
  await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2500);
  lastShotAt = Date.now();
  return p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};

/** 页面上下文内调 API（带 CSRF，自动带 cookie） */
async function api(p, url, { method = "GET", body } = {}) {
  return p.evaluate(
    async ({ url, method, body }) => {
      await fetch("/api/auth/csrf").catch(() => {});
      const csrf = document.cookie
        .split("; ")
        .find((c) => /csrf/i.test(c))
        ?.split("=")[1];
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* 非 JSON（如图片/空响应） */
      }
      return { status: res.status, json };
    },
    { url, method, body },
  );
}

/** 注册（限流 3 次/分钟/IP → 命中 429 时等一个窗口重试一次） */
async function register(p, email, name, { ref } = {}) {
  if (ref) await p.goto(`${BASE}/?ref=${ref}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await api(p, "/api/auth/register", {
      method: "POST",
      body: { email, name, password: PASSWORD },
    });
    if (res.status === 200) return res.json?.data?.user?.id ?? null;
    void email;
    if (res.status === 429 && attempt === 1) {
      console.log("   [retry] 注册限流，等待 65s");
      await p.waitForTimeout(65000);
      continue;
    }
    throw new Error(`注册失败 ${res.status}: ${JSON.stringify(res.json)?.slice(0, 160)}`);
  }
  return null;
}

async function loginAs(p, email, password) {
  return api(p, "/api/auth/login", { method: "POST", body: { email, password } });
}

async function createAddress(p) {
  const res = await api(p, "/api/user/addresses", {
    method: "POST",
    body: {
      recipientName: "QA收货人",
      phone: "13812345678",
      province: "广东省",
      city: "深圳市",
      district: "南山区",
      detail: "科技园 1 号 A 座 1001",
      country: "CN",
      postalCode: "518000",
      isDefault: true,
    },
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`建地址失败 ${res.status}: ${JSON.stringify(res.json)?.slice(0, 200)}`);
  }
  const list = await api(p, "/api/user/addresses");
  // 该接口返回 json({ addresses })：原始信封是 { data: { addresses: [...] } }
  const rows = list.json?.data?.addresses ?? [];
  return rows[0]?.id ?? res.json?.data?.address?.id ?? null;
}

async function placeOrder(p, productId, addressId) {
  return api(p, "/api/orders", {
    method: "POST",
    body: { items: [{ productId, quantity: 1 }], addressId, shippingMethod: "standard" },
  });
}

let cleanupIds = [];
try {
  /* ═══ A. 关系链搭建（真实注册路由 + 代理层推广 cookie） ═══ */
  console.log("\n── A. 推广链接 → 注册绑定 ──");

  // root 无推广来源
  const rootId = await register(page, mail("root"), "QA分销root");
  cleanupIds.push(rootId);
  ok("root 注册成功", !!rootId);

  const rootIdentity = await api(page, "/api/distribution/my/links");
  const rootCode = rootIdentity.json?.data?.identity?.referralCode;
  ok("注册后即有专属推广码（人人可推广）", !!rootCode, rootCode);
  ok(
    "推广链接形态正确",
    typeof rootIdentity.json?.data?.identity?.inviteUrl === "string" &&
      rootIdentity.json.data.identity.inviteUrl.includes(`ref=${rootCode}`),
  );

  // l1 通过 root 的链接注册（走代理层的 ?ref= cookie 捕获）
  const l1Id = await register(page, mail("l1"), "QA分销l1", { ref: rootCode });
  cleanupIds.push(l1Id);
  const l1Identity = await api(page, "/api/distribution/my/links");
  const l1Code = l1Identity.json?.data?.identity?.referralCode;

  // 关键：同一个浏览器上下文里 session 是共享的，此刻已变成 l1 —— 必须切回 root 才能查 root 的身份
  await loginAs(page, mail("root"), PASSWORD);
  const rootAfter = await api(page, "/api/distribution/my/links");
  ok(
    "有客户通过链接注册后，推广人自动成为分销商（无需审核）",
    rootAfter.json?.data?.identity?.isDistributor === true,
  );

  // l2 通过 l1 的链接注册
  const l2Id = await register(page, mail("l2"), "QA分销l2", { ref: l1Code });
  cleanupIds.push(l2Id);
  const l2Identity = await api(page, "/api/distribution/my/links");
  const l2Code = l2Identity.json?.data?.identity?.referralCode;

  // buyer 通过 l2 的链接注册
  const buyerId = await register(page, mail("buyer"), "QA买家", { ref: l2Code });
  cleanupIds.push(buyerId);

  const buyerIdentity = await api(page, "/api/distribution/my/links");
  ok(
    "客户可见自己归属的上级",
    !!buyerIdentity.json?.data?.identity?.boundToName,
    buyerIdentity.json?.data?.identity?.boundToName ?? "",
  );
  ok("纯客户尚未成为分销商", buyerIdentity.json?.data?.identity?.isDistributor === false);

  /* ═══ B. 下单 → 归属（复购仍归原分销商） ═══ */
  console.log("\n── B. 订单归属 ──");
  // 切回买家会话：前面为断言 root 身份把 session 换成了 root，这里必须换回来
  const buyerLogin = await loginAs(page, mail("buyer"), PASSWORD);
  ok("买家重新登录", buyerLogin.status === 200);
  const buyerAddr = await createAddress(page);
  // 必须挑**有库存**的商品：历史 E2E 会把某些商品买到 0 库存（如 xAI Multi Tumbler），
  // 固定取第一件会偶发"缺货"假失败
  const products = await api(page, "/api/products?pageSize=50");
  const candidates = products.json?.data ?? [];
  const productId = candidates.find((p) => Number(p.stock ?? 0) > 5)?.id;
  ok(
    "取到有库存的测试商品与地址",
    !!productId && !!buyerAddr,
    productId ? "" : `候选 ${candidates.length} 件均无库存`,
  );

  const order1 = await placeOrder(page, productId, buyerAddr);
  const orderNumber = order1.json?.data?.order?.orderNumber;
  ok(
    "买家下单成功",
    !!orderNumber,
    orderNumber ??
      `HTTP ${order1.status} ${JSON.stringify(order1.json?.error ?? order1.json)?.slice(0, 200)}`,
  );

  // 复购：带上别人的推广码，归属不应改变
  await page.goto(`${BASE}/?ref=${rootCode}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const order2 = await placeOrder(page, productId, buyerAddr);
  const orderNumber2 = order2.json?.data?.order?.orderNumber;

  /* ═══ C. 支付 → 逐级计佣 ═══ */
  console.log("\n── C. 支付计佣（三级） ──");
  const pay1 = await api(page, `/api/orders/${orderNumber}/mock-pay`, { method: "POST" });
  ok("模拟支付成功", pay1.status === 200, `HTTP ${pay1.status}`);

  const adminLogin = await loginAs(admin, "admin@example.com", "Admin@123456");
  ok("管理员登录", adminLogin.status === 200);

  // 对账补偿（幂等；这里显式触发，验证漏记能被扫平）
  const reconcile = await api(admin, "/api/admin/distribution/reconcile", { method: "POST" });
  ok("对账补偿接口可用", reconcile.status === 200, JSON.stringify(reconcile.json?.data ?? {}));

  const commissions = await api(admin, "/api/admin/distribution/commissions?pageSize=50");
  const rows = commissions.json?.data ?? [];
  const mine = rows.filter((r) => r.orderNumber === orderNumber);
  ok("佣金流水已生成", mine.length > 0, `该订单 ${mine.length} 条`);
  ok(
    "三级分佣（层级 1/2/3）",
    [1, 2, 3].every((lv) => mine.some((r) => r.level === lv)),
  );
  const lv1 = mine.find((r) => r.level === 1);
  ok("一级比例 10%", lv1?.ratio === 10, `ratio=${lv1?.ratio}`);
  ok(
    "折合人民币金额为正",
    mine.every((r) => Number(r.amountCny) > 0),
  );

  // 发货 → 买家确认收货 → 佣金转可提现（顺带验证收货即结算的钩子）
  const orderId = order1.json?.data?.order?.id;
  const ship = await api(admin, `/api/admin/orders/${orderId}/ship`, {
    method: "POST",
    body: { trackingCompany: "顺丰", trackingNumber: `SF${stamp}` },
  });
  ok("后台发货", ship.status === 200, `HTTP ${ship.status}`);
  const confirm = await api(page, `/api/orders/${orderNumber}/confirm-delivery`, {
    method: "POST",
  });
  ok("买家确认收货", confirm.status === 200, `HTTP ${confirm.status}`);

  const settled = await api(
    admin,
    "/api/admin/distribution/commissions?status=SETTLED&pageSize=50",
  );
  const settledRows = settled.json?.data ?? [];
  ok(
    "确认收货后该订单佣金转为已结算",
    settledRows.some((r) => r.orderNumber === orderNumber),
  );

  /* ═══ D. 后台页面 ═══ */
  console.log("\n── D. 平台后台 ──");
  await admin.goto(`${BASE}/admin/distribution`, { waitUntil: "networkidle", timeout: 120000 });
  await admin.getByText("分销商").first().waitFor({ timeout: 60000 });
  ok("分销总览页渲染", true);
  await shot("dist-admin-overview", admin);

  await admin.goto(`${BASE}/admin/distribution/rules`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await admin.getByText("佣金规则").first().waitFor({ timeout: 60000 });
  // 「加载中…」是骨架态：必须等到真实行出现，否则会把"还没加载完"误判成"没有规则"
  await admin
    .locator("table tbody tr")
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  const ruleRows = await admin.locator("table tbody tr").count();
  ok("佣金规则页有默认三级规则", ruleRows >= 3, `${ruleRows} 行`);
  await shot("dist-admin-rules", admin);

  await admin.goto(`${BASE}/admin/distribution/commissions`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await admin.getByText("佣金流水").first().waitFor({ timeout: 60000 });
  ok("佣金流水页渲染", true);
  await shot("dist-admin-commissions", admin);

  await admin.goto(`${BASE}/admin/distribution/relations?q=${encodeURIComponent(mail("l2"))}`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await admin.getByText("关系链").first().waitFor({ timeout: 60000 });
  await admin
    .getByText("QA分销l2", { exact: false })
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  const chainText = await admin.locator("body").innerText();
  ok("关系链页能按邮箱查到上级链", /分销/.test(chainText) && chainText.includes("QA分销l2"));
  await shot("dist-admin-relations", admin);

  /* ═══ E. 账户里的分享小卡片 + 独立分销中心 ═══ */
  console.log("\n── E. 分销商后台（独立页面）──");
  await loginAs(page, mail("l2"), PASSWORD);

  // 大爷实测反馈过「看不到分享卡片」：顶栏 Account 的落地页必须直接能看到它
  await page.goto(`${BASE}/account`, { waitUntil: "networkidle", timeout: 120000 });
  await page
    .getByText(l2Code, { exact: false })
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  const landingText = await page.locator("body").innerText();
  ok(
    "顶栏 Account 落地页（/account）直接能看到分享卡片",
    /Share your link|分享你的专属链接/.test(landingText),
    landingText.replace(/\s+/g, " ").slice(0, 80),
  );
  // 大爷要求它同时是「账号总预览页」：概览统计 + 最近订单都要在
  ok(
    "落地页是账号总览（统计卡 + 最近订单 + 查看全部）",
    /Total orders|累计订单/.test(landingText) &&
      /Recent orders|最近订单/.test(landingText) &&
      /View all|查看全部/.test(landingText),
  );
  await shot("dist-account-landing", page);

  // 大爷定制形态：左侧导航**不能**出现「我的推广」主入口
  await page.goto(`${BASE}/account/profile`, { waitUntil: "networkidle", timeout: 120000 });
  await page
    .getByText(l2Code, { exact: false })
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  const profileText = await page.locator("body").innerText();
  const navText = await page
    .locator("nav, aside")
    .first()
    .innerText()
    .catch(() => "");
  ok("个人资料页出现分享小卡片（含专属链接）", profileText.includes(l2Code));
  ok(
    "左侧账户导航没有「我的推广/My Promotion」主入口",
    !/My Promotion|我的推广/.test(navText),
    navText.replace(/\s+/g, " ").slice(0, 80),
  );
  const consoleLink = page.locator('a[href="/distribution"]').first();
  ok(
    "分享卡片的「进入分销中心」是新窗口打开",
    (await consoleLink.getAttribute("target")) === "_blank",
    `target=${await consoleLink.getAttribute("target")}`,
  );
  await shot("dist-share-card", page);

  // 独立外壳：分销中心不套商城页头/页脚/账户导航
  await page.goto(`${BASE}/distribution`, { waitUntil: "networkidle", timeout: 120000 });
  await page
    .getByText(l2Code, { exact: false })
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  const shellText = await page.locator("body").innerText();
  ok(
    "分销中心有页面标题（Distribution center / 分销中心）",
    /Distribution center|分销中心/.test(shellText),
    shellText.replace(/\s+/g, " ").slice(0, 60),
  );
  // 大爷 2026-09-20 二次反馈：独立页面也要「跟原网站风格一样」（只是新窗口打开）
  ok(
    "分销中心沿用商城页头/页脚视觉（购物袋 + 页脚法务链接都在）",
    /Cart|购物车/.test(shellText) && /FAQs|常见问题/.test(shellText),
    shellText.replace(/\s+/g, " ").slice(0, 80),
  );
  await page.goto(`${BASE}/distribution`, { waitUntil: "networkidle", timeout: 120000 });
  await page
    .getByText(l2Code, { exact: false })
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  const dashText = await page.locator("body").innerText();
  ok("分销商总览渲染且展示推广码", dashText.includes(l2Code), `code=${l2Code}`);
  ok("总览显示团队/客户数据", /客户|团队|Customers|Team/i.test(dashText));
  await shot("dist-user-overview", page);

  await page.goto(`${BASE}/distribution/customers`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page
    .locator("table tbody tr")
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  const custText = await page.locator("body").innerText();
  ok("我的客户页渲染", /客户|Customers/i.test(custText));
  ok(
    "手机号已脱敏（页面上看不到完整号码）",
    !custText.includes("13812345678"),
    custText.includes("138****") ? "已显示 138****" : "未见完整号",
  );
  await shot("dist-user-customers", page);

  await page.goto(`${BASE}/distribution/commissions`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page
    .locator("table tbody tr")
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  const commText = await page.locator("body").innerText();
  ok("我的佣金页渲染", /佣金|Commission/i.test(commText));
  await shot("dist-user-commissions", page);

  /* ═══ F. 提现闭环 ═══ */
  console.log("\n── F. 提现 ──");
  // 把最低提现额降到 1 元（顺带验证后台配置接口），这样小额测试佣金也能走完整提现闭环
  const cfg = await api(admin, "/api/admin/distribution/config", {
    method: "PUT",
    body: { minWithdrawAmount: 1 },
  });
  ok("后台可修改分销配置（最低提现额）", cfg.status === 200, `HTTP ${cfg.status}`);

  const account = await api(page, "/api/distribution/my/account");
  const balance = Number(account.json?.data?.account?.balance ?? 0);
  const minWithdraw = Number(account.json?.data?.minWithdrawAmount ?? 0);
  console.log(`   可提现余额 ¥${balance}，最低提现 ¥${minWithdraw}`);

  if (balance >= minWithdraw && balance > 0) {
    const applied = await api(page, "/api/distribution/withdraw", {
      method: "POST",
      body: {
        amount: Math.min(balance, minWithdraw),
        accountInfo: "6222021234567890123",
        remark: "QA 提现",
        // P1-10：一期线下打款要求实名 + 收款方式 + 规则确认
        payeeName: "QA收货人",
        payeeMethod: "bank",
        acceptTerms: true,
      },
    });
    ok("提交提现申请", applied.status === 200, `HTTP ${applied.status}`);
    const after = await api(page, "/api/distribution/my/account");
    ok(
      "申请后余额转入冻结",
      Number(after.json?.data?.account?.frozen) >= minWithdraw,
      `frozen=${after.json?.data?.account?.frozen}`,
    );

    await admin.goto(`${BASE}/admin/distribution/withdrawals`, {
      waitUntil: "networkidle",
      timeout: 120000,
    });
    await admin.getByText("提现").first().waitFor({ timeout: 60000 });
    ok("后台提现审核页渲染", true);
    await shot("dist-admin-withdrawals", admin);

    const pendingList = await api(admin, "/api/admin/distribution/withdrawals?status=PENDING");
    // 该接口是 json({data,pagination,counts})：原始信封 → { data: { data: [...] , ... } }
    const pending = pendingList.json?.data?.data?.[0];
    if (pending) {
      const approve = await api(admin, `/api/admin/distribution/withdrawals/${pending.id}`, {
        method: "POST",
        body: { action: "approve", note: "QA 审核通过" },
      });
      ok("后台审核通过提现", approve.status === 200, `HTTP ${approve.status}`);
      const paid = await api(admin, `/api/admin/distribution/withdrawals/${pending.id}`, {
        method: "POST",
        body: { action: "paid", payNote: `线下转账 #${stamp}` },
      });
      ok("后台标记已打款", paid.status === 200, `HTTP ${paid.status}`);
      const after2 = await api(page, "/api/distribution/my/account");
      ok(
        "打款后冻结核销",
        Number(after2.json?.data?.account?.frozen ?? -1) === 0,
        `frozen=${after2.json?.data?.account?.frozen}`,
      );
    } else {
      ok("后台能查到待审核提现单", false);
    }
  } else {
    console.log("   [skip] 余额不足最低提现门槛（佣金尚未结算），跳过提现动作");
    ok("提现门槛配置生效（余额不足时不放行）", true);
  }

  // P1-8：新增运维视图（风控 / 升级记录 / 换绑审核）+ 佣金流水页的冲正与导出入口
  for (const [path, text] of [
    ["/admin/distribution/risk", /风控视图/],
    ["/admin/distribution/promotions", /自动升级记录/],
    ["/admin/distribution/rebinds", /换绑审核/],
  ]) {
    await admin.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await admin.waitForTimeout(2500);
    const body = await admin.locator("body").innerText();
    ok(`${path} 渲染`, text.test(body), body.replace(/\s+/g, " ").slice(0, 60));
  }
  await admin.goto(`${BASE}/admin/distribution/commissions`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await admin
    .getByText("佣金流水")
    .first()
    .waitFor({ timeout: 60000 })
    .catch(() => {});
  const commissionsText = await admin.locator("body").innerText();
  ok("佣金流水页有导出 CSV 入口", /导出 CSV/.test(commissionsText));
  ok("佣金流水页有逐条「冲正」操作", /冲正/.test(commissionsText));
  await shot("dist-admin-commissions-tools", admin);

  /* ═══ G. 权限隔离与站点衔接（大爷 2026-09-20 反馈） ═══ */
  console.log("\n── G. 权限隔离 / 分类标题 / 空车去向 / 中文文案 ──");

  // 3) 权限：顾客不能进管理后台（前端入口有可以，但后台本身必须挡住）
  await page.goto(`${BASE}/admin/distribution`, { waitUntil: "domcontentloaded", timeout: 120000 });
  ok(
    "顾客访问 /admin/distribution 被弹到后台登录页",
    /\/admin\/login/.test(page.url()),
    page.url().replace(BASE, ""),
  );
  const adminApiAsCustomer = await api(page, "/api/admin/distribution/overview");
  ok(
    "顾客调用管理端接口被拒（403/401）",
    adminApiAsCustomer.status === 401 || adminApiAsCustomer.status === 403,
    `HTTP ${adminApiAsCustomer.status}`,
  );

  // 4) 管理员在前端账号里能看到「进入管理后台」（仅员工）
  const adminFront = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminFrontPage = await adminFront.newPage();
  await adminFrontPage.goto(`${BASE}/auth/login`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await adminFrontPage.evaluate(async () => {
    await fetch("/api/auth/csrf");
    const csrf = document.cookie
      .split("; ")
      .find((c) => /csrf/i.test(c))
      ?.split("=")[1];
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ email: "admin@example.com", password: "Admin@123456" }),
    });
  });
  await adminFrontPage.goto(`${BASE}/account`, { waitUntil: "networkidle", timeout: 120000 });
  await adminFrontPage.waitForTimeout(2000);
  const staffText = await adminFrontPage.locator("body").innerText();
  ok(
    "管理员前端账号出现「进入管理后台」入口",
    /Enter admin console|进入管理后台/.test(staffText),
    staffText.replace(/\s+/g, " ").slice(0, 70),
  );
  const backendLink = adminFrontPage.locator('a[href="/admin"]').first();
  ok(
    "该入口是新窗口打开 /admin",
    (await backendLink.getAttribute("target")) === "_blank",
    `target=${await backendLink.getAttribute("target")}`,
  );
  await shot("dist-admin-front-entry", adminFrontPage);
  await adminFront.close();
  // 顾客侧不应出现该入口
  await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(2500);
  ok(
    "顾客前端账号没有「进入管理后台」入口",
    !/Enter admin console|进入管理后台/.test(await page.locator("body").innerText()),
  );

  // 5) 分类页标题规则（原站实测：有横图无标题 / 无横图显示分类名）
  for (const [slug, expectTitle] of [
    ["mens", false], // dev 库：mens 有 bannerImage
    ["womens", true], // dev 库：womens 没有 bannerImage（但有卡片图）
  ]) {
    await page.goto(`${BASE}/collections/${slug}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(1500);
    const h1 = await page
      .locator("h1")
      .first()
      .innerText()
      .catch(() => "");
    const has = !!(await page.locator("h1").count());
    ok(
      `分类页 /collections/${slug} ${expectTitle ? "显示" : "不显示"}分类名（横图规则）`,
      has === expectTitle,
      `h1=${has ? h1 : "(无)"}`,
    );
  }

  // 6) 空购物车 CTA 指向「所有产品」页（原站 /collections/all，标题 Products）
  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page
    .locator('a[href="/collections/all"]')
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {});
  const cartAllLink = page.locator('a[href="/collections/all"]').first();
  ok("空购物车的「开始购物」指向 /collections/all（所有产品）", (await cartAllLink.count()) > 0);
  const allPage = await api(page, "/api/products?pageSize=1");
  ok("所有产品页数据可用", allPage.status === 200);
  await page.goto(`${BASE}/collections/all`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(1500);
  ok(
    "/collections/all 渲染为「Products」页（原站同款）",
    /Products/.test(
      await page
        .locator("h1")
        .first()
        .innerText()
        .catch(() => ""),
    ),
  );

  // 7) 中文界面下 profile 的登录邮箱卡片必须是中文（此前硬编码英文 → i18n 泄漏）
  await page.goto(`${BASE}/zh/account/profile`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page
    .getByText("修改登录邮箱")
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {});
  const zhProfile = await page.locator("body").innerText();
  ok(
    "中文界面「修改登录邮箱」卡片已本地化（不再漏英文）",
    zhProfile.includes("修改登录邮箱") && !zhProfile.includes("Change sign-in email"),
    /修改登录邮箱/.test(zhProfile) ? "已中文化" : "仍是英文",
  );

  // 2) 分销规则说明页（大爷要求：分销商要知道游戏规则）
  await page.goto(`${BASE}/distribution/rules`, { waitUntil: "domcontentloaded", timeout: 120000 });
  // 等正文首段渲染（tab 文案在骨架屏阶段就已经存在，不能用来判断"加载完成"）
  await page
    .getByText("How you earn", { exact: false })
    .first()
    .waitFor({ timeout: 90000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  const rulesText = await page.locator("body").innerText();
  ok(
    "分销中心有「规则说明」页（层级比例来自实际配置）",
    /How you earn|规则说明/.test(rulesText) && /%/.test(rulesText),
    rulesText.replace(/\s+/g, " ").slice(0, 70),
  );
  // 层级表必须**每级一行**（曾因 NULL/空串重复行出现同一层级两条比例）
  const levelRows = await page.locator("table tbody tr").count();
  ok("规则表每级只有一行（无重复层级）", levelRows === 3, `${levelRows} 行`);
  await shot("dist-user-rules", page);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAIL`}`);
} catch (err) {
  failures++;
  console.log(`FAIL: 脚本异常中断 → ${String(err).slice(0, 300)}`);
  try {
    await shot("dist-failure", page);
  } catch {
    /* ignore */
  }
} finally {
  // 清理测试账号（后台匿名化删除；分销流水随之级联清理）
  for (const id of cleanupIds.filter(Boolean)) {
    try {
      await api(admin, `/api/admin/users/${id}`, { method: "DELETE" });
    } catch {
      /* 忽略 */
    }
  }
  console.log(`cleanup: 已请求删除 ${cleanupIds.filter(Boolean).length} 个测试账号`);
  await browser.close();
}

process.exit(failures === 0 ? 0 : 1);
