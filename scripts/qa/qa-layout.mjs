// 布局规范 QA：对**原站实测值**的程序化断言。
//
// 视口固定 1216×900 —— 仓库里记录的原站实测值（PLP 341×341 / 列间距 48 / 行 pitch 470、
// collections 353×353 / 间距 30 / 卡顶 y214、cart 按钮 174px、PDP 主图 592×592 / 栅格
// 7fr:80px:3fr）全部对应 1216 布局宽。用别的视口比会得出错误结论。
//
// ⚠ 本脚本曾长期带着两个**错误期望值**，导致「正确的代码被判失败」：
//   ① `All Products 28px` —— 28px 出自 docs/DESIGN.md（该文档已证不可靠）。
//      实际 26px 有实测依据：1200 视口标题字形宽 142 → ≈26px，见 globals.css 的
//      --home-title-size 注释。断言 28px 会一直在正确的代码上报红。
//   ② `PDP 信息栏固定 336px` —— 同样出自 docs/DESIGN.md。实际 (1120−80)×3/10 = **312px**。
//   会谎报失败的断言比没有断言更糟：它训练人忽略这个脚本。期望值一律以实测为准。
//
// 运行：node scripts/qa/qa-layout.mjs（dev/prod 启动后）
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const VIEWPORT = { width: 1216, height: 900 };
const results = [];
function check(name, actual, ok, expected) {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name.padEnd(34)} 实际=${actual}${ok ? "" : `  期望=${expected}`}`);
}

const browser = await chromium.launch();

(async () => {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180_000);

  // 预编译：本卷上首次访问单路由可超过 90s
  console.log("预热路由（首次编译较慢）…");
  for (const r of ["/", "/products", "/collections", "/cart"]) {
    const t0 = Date.now();
    await page.goto(BASE + r, { waitUntil: "domcontentloaded" });
    console.log(`  ${r} 就绪 ${Date.now() - t0}ms`);
  }

  // 商品 slug 在这里就定下来，好把 PDP 路由也预热掉。
  // 不写死 slug：库存是跨测试递减的（seed 用 update:{} 不重置），
  // 硬编码的商品可能已售罄 → 按钮变 "Sold out"，断言会莫名其妙地失败。
  const slug = await page.evaluate(async () => {
    const r = await fetch("/api/products?pageSize=50");
    const j = await r.json();
    const rows = j?.data ?? [];
    return rows.find((p) => (p.stock ?? 0) > 0)?.slug ?? rows[0]?.slug ?? null;
  });
  if (slug) {
    // PDP 冷编译时页面会先到、图片后到，若不预热，后面的几何测量会读到 0×0。
    const t0 = Date.now();
    await page.goto(`${BASE}/products/${slug}`, { waitUntil: "domcontentloaded" });
    console.log(`  /products/${slug} 就绪 ${Date.now() - t0}ms`);
  }

  // ── 首页 ──────────────────────────────────────────────
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const home = await page.evaluate(() => {
    const heroGrid = [...document.querySelectorAll("section.grid, [class*='grid-cols-2']")].find(
      (g) => g.children.length === 2 && g.querySelector("img"),
    );
    const firstBanner = heroGrid?.children[0];
    const br = firstBanner?.getBoundingClientRect();
    const card = document.querySelector('a[href*="/products/"]');
    const grid = card?.closest('[class*="grid"]');
    const gcs = grid ? getComputedStyle(grid) : null;
    const gr = grid?.getBoundingClientRect();
    const cr = card?.getBoundingClientRect();
    const media = card?.querySelector("img")?.parentElement;
    const mr = media?.getBoundingClientRect();
    const cards = [...document.querySelectorAll('a[href*="/products/"]')];
    const row2 = cards[3]?.getBoundingClientRect();
    const ap = [...document.querySelectorAll("h2, h1")].find((h) => /All Products/i.test(h.textContent || ""));
    const apcs = ap ? getComputedStyle(ap) : null;
    const apr = ap?.getBoundingClientRect();
    return {
      heroCount: heroGrid?.children.length ?? 0,
      bannerW: br ? Math.round(br.width) : 0,
      bannerH: br ? Math.round(br.height) : 0,
      gridCols: gcs ? gcs.gridTemplateColumns.split(/\s+/).length : 0,
      gridColGap: gcs ? Math.round(parseFloat(gcs.columnGap)) : 0,
      gridLeft: gr ? Math.round(gr.left) : 0,
      cardTop: cr ? Math.round(cr.top) : 0,
      cardW: cr ? Math.round(cr.width) : 0,
      cardH: cr ? Math.round(cr.height) : 0,
      mediaW: mr ? Math.round(mr.width) : 0,
      mediaH: mr ? Math.round(mr.height) : 0,
      rowPitch: cr && row2 ? Math.round(row2.top - cr.top) : 0,
      apSize: apcs ? apcs.fontSize : "?",
      apWeight: apcs ? apcs.fontWeight : "?",
      apTop: apr ? Math.round(apr.top) : 0,
    };
  });
  check("首页双横幅 × 2", `${home.heroCount}`, home.heroCount === 2, "2");
  // 横幅为 720/404 定比：期望高由实际宽推出，避免写死一个只对某个视口成立的数字
  const bannerExpect = Math.round((home.bannerW * 404) / 720);
  check(
    `首页横幅高 720:404`,
    `${home.bannerH}px`,
    Math.abs(home.bannerH - bannerExpect) <= 2,
    `${bannerExpect}px±2`,
  );
  check("首页商品网格 3 列", `${home.gridCols}`, home.gridCols === 3, "3");
  check("首页网格列间距 48px", `${home.gridColGap}px`, Math.abs(home.gridColGap - 48) <= 1, "48px±1");
  check("首页网格左缘 48px", `${home.gridLeft}px`, Math.abs(home.gridLeft - 48) <= 1, "48px±1");
  check("首页卡片 341 宽", `${home.cardW}px`, Math.abs(home.cardW - 341) <= 2, "341px±2");
  check("首页卡片媒体 341×341", `${home.mediaW}×${home.mediaH}`, Math.abs(home.mediaW - home.mediaH) <= 1 && Math.abs(home.mediaW - 341) <= 2, "341×341±2");
  check("首页行 pitch 470px", `${home.rowPitch}px`, Math.abs(home.rowPitch - 470) <= 3, "470px±3");
  check("首页首行卡片顶 y=555", `y=${home.cardTop}`, Math.abs(home.cardTop - 555) <= 2, "y=555±2");
  check("All Products 26px/400", `${home.apSize}/${home.apWeight}`, home.apSize === "26px" && home.apWeight === "400", "26px/400");
  check("All Products 行盒顶 y=472", `y=${home.apTop}`, Math.abs(home.apTop - 472) <= 2, "y=472±2");

  // ── PLP /products ─────────────────────────────────────
  await page.goto(BASE + "/products", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const plp = await page.evaluate(() => {
    const h = document.querySelector("h1");
    const hr = h?.getBoundingClientRect();
    const shell = h?.parentElement;
    const shellCs = shell ? getComputedStyle(shell) : null;
    const cards = [...document.querySelectorAll('a[href*="/products/"]')];
    const grid = cards[0]?.closest('[class*="grid"]');
    const gcs = grid ? getComputedStyle(grid) : null;
    const c0 = cards[0]?.getBoundingClientRect();
    const c3 = cards[3]?.getBoundingClientRect();
    const media = cards[0]?.querySelector("img")?.parentElement;
    const mr = media?.getBoundingClientRect();
    return {
      h1Left: hr ? Math.round(hr.left) : 0,
      h1Size: h ? getComputedStyle(h).fontSize : "?",
      h1Top: hr ? Math.round(hr.top) : 0,
      shellPad: shellCs ? Math.round(parseFloat(shellCs.paddingLeft)) : 0,
      cols: gcs ? gcs.gridTemplateColumns.split(/\s+/).length : 0,
      colGap: gcs ? Math.round(parseFloat(gcs.columnGap)) : 0,
      cardW: c0 ? Math.round(c0.width) : 0,
      cardTop: c0 ? Math.round(c0.top) : 0,
      pitch: c0 && c3 ? Math.round(c3.top - c0.top) : 0,
      mediaW: mr ? Math.round(mr.width) : 0,
      mediaH: mr ? Math.round(mr.height) : 0,
    };
  });
  check("PLP 容器内边距 48px", `${plp.shellPad}px`, Math.abs(plp.shellPad - 48) <= 1, "48px±1");
  check("PLP 标题左缘 48px", `${plp.h1Left}px`, Math.abs(plp.h1Left - 48) <= 1, "48px±1");
  check("PLP 标题 28px", plp.h1Size, plp.h1Size === "28px", "28px");
  check("PLP 3 列", `${plp.cols}`, plp.cols === 3, "3");
  check("PLP 列间距 48px", `${plp.colGap}px`, Math.abs(plp.colGap - 48) <= 1, "48px±1");
  check("PLP 卡片 341 宽", `${plp.cardW}px`, Math.abs(plp.cardW - 341) <= 2, "341px±2");
  check("PLP 卡片媒体 341×341", `${plp.mediaW}×${plp.mediaH}`, Math.abs(plp.mediaW - plp.mediaH) <= 1 && Math.abs(plp.mediaW - 341) <= 2, "341×341±2");
  check("PLP 行 pitch 470px", `${plp.pitch}px`, Math.abs(plp.pitch - 470) <= 3, "470px±3");
  check("PLP 首行卡片顶 y=274", `y=${plp.cardTop}`, Math.abs(plp.cardTop - 274) <= 3, "y=274±3");

  // ── collections ───────────────────────────────────────
  await page.goto(BASE + "/collections", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const coll = await page.evaluate(() => {
    const h = document.querySelector("h1");
    const links = [...document.querySelectorAll('a[href*="category="]')];
    const grid = links[0]?.parentElement;
    const gcs = grid ? getComputedStyle(grid) : null;
    const gr = grid?.getBoundingClientRect();
    const c0 = links[0]?.getBoundingClientRect();
    const c1 = links[1]?.getBoundingClientRect();
    const cap = links[0]?.querySelector("span, h2, h3, div");
    const capCs = cap ? getComputedStyle(cap) : null;
    const cr = cap?.getBoundingClientRect();
    // 卡片底色所在的面：往上找第一个非透明的背景
    let surface = grid;
    let surfaceBg = "";
    while (surface && surface !== document.body) {
      const bg = getComputedStyle(surface).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)") { surfaceBg = bg; break; }
      surface = surface.parentElement;
    }
    return {
      surfaceBg,
      cols: gcs ? gcs.gridTemplateColumns.split(/\s+/).length : 0,
      gap: gcs ? Math.round(parseFloat(gcs.gap)) : 0,
      cardW: c0 ? Math.round(c0.width) : 0,
      cardH: c0 ? Math.round(c0.height) : 0,
      cardTop: c0 ? Math.round(c0.top) : 0,
      colPitch: c0 && c1 ? Math.round(c1.left - c0.left) : 0,
      capColor: capCs ? capCs.color : "?",
      capSize: capCs ? capCs.fontSize : "?",
      capLeft: cr ? Math.round(cr.left) : 0,
      cardLeft: c0 ? Math.round(c0.left) : 0,
      h1Size: h ? getComputedStyle(h).fontSize : "?",
      count: links.length,
    };
  });
  check("collections 底色 rgb(239,239,239)", coll.surfaceBg, coll.surfaceBg === "rgb(239, 239, 239)", "rgb(239,239,239)");
  check("collections 4 张卡", `${coll.count}`, coll.count === 4, "4");
  check("collections 3 列", `${coll.cols}`, coll.cols === 3, "3");
  check("collections 间距 30px", `${coll.gap}px`, Math.abs(coll.gap - 30) <= 1, "30px±1");
  check("collections 卡片 353×353", `${coll.cardW}×${coll.cardH}`, Math.abs(coll.cardW - coll.cardH) <= 1 && Math.abs(coll.cardW - 353) <= 2, "353×353±2");
  check("collections 列 pitch 383px", `${coll.colPitch}px`, Math.abs(coll.colPitch - 383) <= 3, "383px±3");
  check("collections 卡片顶 y=214", `y=${coll.cardTop}`, Math.abs(coll.cardTop - 214) <= 3, "y=214±3");
  check("collections 标题白字", coll.capColor, coll.capColor === "rgb(255, 255, 255)", "rgb(255,255,255)");
  check("collections 标题 20px", coll.capSize, coll.capSize === "20px", "20px");
  check("collections 标题左内缩 48px", `${coll.capLeft - coll.cardLeft}px`, Math.abs(coll.capLeft - coll.cardLeft - 48) <= 2, "48px±2");

  // ── cart 空态 ─────────────────────────────────────────
  await page.goto(BASE + "/cart", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const cart = await page.evaluate(() => {
    const h = document.querySelector("h1, h2");
    const hr = h?.getBoundingClientRect();
    const btn = [...document.querySelectorAll("a,button")].find((b) =>
      /shop all|continue shopping|去购物|选购|开始购物/i.test(b.textContent || ""),
    );
    const br = btn?.getBoundingClientRect();
    const bcs = btn ? getComputedStyle(btn) : null;
    return {
      headTop: hr ? Math.round(hr.top) : 0,
      btnW: br ? Math.round(br.width) : 0,
      btnH: br ? Math.round(br.height) : 0,
      btnBg: bcs ? bcs.backgroundColor : "?",
      btnText: btn?.textContent?.trim() ?? "(未找到)",
    };
  });
  check("cart 空态标题顶 y=329", `y=${cart.headTop}`, Math.abs(cart.headTop - 329) <= 3, "y=329±3");
  check(`cart 按钮「${cart.btnText}」宽 174px`, `${cart.btnW}px`, Math.abs(cart.btnW - 174) <= 2, "174px±2");
  check("cart 按钮高 46px", `${cart.btnH}px`, Math.abs(cart.btnH - 46) <= 1, "46px±1");
  check("cart 按钮底色 rgb(28,28,28)", cart.btnBg, cart.btnBg === "rgb(28, 28, 28)", "rgb(28,28,28)");

  // ── PDP ───────────────────────────────────────────────
  if (slug) {
    await page.goto(`${BASE}/products/${slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const pdp = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll("img")];
      const main = imgs.find((i) => i.getBoundingClientRect().width > 300);
      const mr = main?.getBoundingClientRect();
      const g = [...document.querySelectorAll('[class*="grid"]')].find(
        (el) => el.querySelector("img") && el.getBoundingClientRect().width > 600,
      );
      const gcs = g ? getComputedStyle(g) : null;
      const cols = gcs ? gcs.gridTemplateColumns.split(/\s+/).map(parseFloat) : [];
      const addBtn = [...document.querySelectorAll("button")].find((b) =>
        /add to (cart|bag)|加入购物车/i.test(b.textContent || ""),
      );
      const abr = addBtn?.getBoundingClientRect();
      const thumbs = imgs
        .filter((i) => {
          const w = i.getBoundingClientRect().width;
          // 排除页头：Logo 宽 66px，会落进「缩略图尺寸」的窗口而被误当成缩略图
          return !i.closest("header") && w > 30 && w < 90;
        })
        .slice(0, 3)
        .map((i) => {
          const r = i.getBoundingClientRect();
          return { top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left) };
        });
      return {
        mainW: mr ? Math.round(mr.width) : 0,
        mainH: mr ? Math.round(mr.height) : 0,
        mainTop: mr ? Math.round(mr.top) : 0,
        // 取首列与末列：栅格若变成 3 track（含间隙列）也能正确取到信息栏宽
        mediaCol: cols.length ? Math.round(cols[0]) : 0,
        infoCol: cols.length ? Math.round(cols[cols.length - 1]) : 0,
        colGap: gcs ? Math.round(parseFloat(gcs.columnGap)) : 0,
        addBtnH: abr ? Math.round(abr.height) : 0,
        addBtnRadius: addBtn ? getComputedStyle(addBtn).borderRadius : "?",
        thumbs,
      };
    });
    check("PDP 主图 592×592", `${pdp.mainW}×${pdp.mainH}`, Math.abs(pdp.mainW - 592) <= 3 && Math.abs(pdp.mainH - 592) <= 3, "592×592±3");
    check("PDP 主图顶 y=113", `y=${pdp.mainTop}`, Math.abs(pdp.mainTop - 113) <= 3, "y=113±3");
    check("PDP 媒体列 728px", `${pdp.mediaCol}px`, Math.abs(pdp.mediaCol - 728) <= 3, "728px±3");
    check("PDP 信息栏 312px", `${pdp.infoCol}px`, Math.abs(pdp.infoCol - 312) <= 3, "312px±3");
    check("PDP 列间距 80px", `${pdp.colGap}px`, Math.abs(pdp.colGap - 80) <= 1, "80px±1");
    check("PDP 加购按钮 46px 高", `${pdp.addBtnH}px`, Math.abs(pdp.addBtnH - 46) <= 1, "46px±1");
    check("PDP 加购按钮方角", pdp.addBtnRadius, /^0(px)?$/.test(pdp.addBtnRadius), "0px");
    const t0 = pdp.thumbs[0];
    const t1 = pdp.thumbs[1];
    check("PDP 缩略图 52×52", t0 ? `${t0.w}×${t0.h}` : "(未找到)", !!t0 && Math.abs(t0.w - 52) <= 2 && Math.abs(t0.h - 52) <= 2, "52×52±2");
    check("PDP 缩略图图间距 20px", t0 && t1 ? `${t1.top - t0.top - t0.h}px` : "(未找到)", !!t0 && !!t1 && Math.abs(t1.top - t0.top - t0.h - 20) <= 2, "20px±2");
    check("PDP 缩略图盒左缘 48px", t0 ? `${t0.left}px` : "(未找到)", !!t0 && Math.abs(t0.left - 50) <= 3, "≈50px(盒 48 + 居中偏移 2)");

    // ── PDP 两栏断点必须正好在 1000px ──
    // 原站取证（scripts/qa/qa-upstream-pdp-vs-header.mjs）：用同一条截图通道同时看
    // 「页头 Logo 是否左对齐」与「PDP 是否两栏」，两者在**同一请求宽**翻转；
    // 页头断点已独立实测为 1000px ⇒ PDP 断点同为 1000px。
    // 本地此前用 lg:(1024px)，在 1000~1023px 显示单栏 —— 已修，此处锁死。
    const colAt = async (w) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`${BASE}/products/${slug}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);
      return page.evaluate(() => {
        const g = document.querySelector(".pdp-grid");
        return g ? getComputedStyle(g).gridTemplateColumns.split(/\s+/).filter(Boolean).length : 0;
      });
    };
    const c999 = await colAt(999);
    const c1000 = await colAt(1000);
    check("PDP 999px 仍单栏", `${c999} 列`, c999 === 1, "1 列");
    check("PDP 1000px 起两栏", `${c1000} 列`, c1000 >= 2, "≥2 列");
    await page.setViewportSize(VIEWPORT);
  } else {
    console.log("⚠ 取不到商品 slug，跳过 PDP 断言");
  }

  // ── admin（需登录）────────────────────────────────────
  const actx = await browser.newContext({ viewport: VIEWPORT });
  const api = actx.request;
  await api.get(BASE + "/api/auth/csrf");
  const csrf = (await actx.cookies()).find((c) => /csrf/i.test(c.name))?.value || "";
  const login = await api.post(BASE + "/api/auth/login", {
    data: { email: "admin@example.com", password: "Admin@123456", scope: "admin" },
    headers: { "x-csrf-token": csrf, "content-type": "application/json" },
  });
  if (login.ok()) {
    const p2 = await actx.newPage();
    p2.setDefaultTimeout(180_000);
    await p2.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
    await p2.waitForTimeout(2500);
    const admin = await p2.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const btn = document.querySelector("main button, aside button");
      return {
        scoped: document.documentElement.className.includes("admin-theme"),
        radius: root.getPropertyValue("--radius").trim(),
        btnRadius: btn ? getComputedStyle(btn).borderRadius : "?",
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });
    check("admin .admin-theme 作用域", `${admin.scoped}`, admin.scoped, "true");
    check("admin 圆角 8px", admin.btnRadius, admin.btnRadius === "8px", "8px");
    check("admin 冷调浅灰底", admin.bodyBg, admin.bodyBg === "rgb(244, 246, 248)", "rgb(244,246,248)");

    await p2.goto(BASE + "/admin/orders", { waitUntil: "domcontentloaded" });
    await p2.waitForTimeout(2500);
    const table = await p2.evaluate(() => {
      const t = document.querySelector("table");
      if (!t) return { hasTable: false };
      const stickyRight = [...t.querySelectorAll("th,td")].filter(
        (c) => /sticky/.test(c.className) && /right/.test(c.className),
      ).length;
      return { hasTable: true, stickyRight };
    });
    check("admin 订单表 sticky 操作列", `${table.stickyRight}`, table.hasTable && table.stickyRight > 0, ">0");
  } else {
    console.log("⚠ admin 登录失败，跳过 admin 断言");
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  if (failed.length) {
    console.log("失败项：");
    for (const f of failed) console.log("  - " + f.name);
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
