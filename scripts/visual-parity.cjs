/**
 * visual-parity.cjs — 双站计算样式审计：逐页面比对 shop.x.com 与本地站点的关键视觉指纹。
 * 用法: node scripts/visual-parity.cjs   （需 dev server 运行于 :3000）
 * 输出: /tmp/parity-report.json + 控制台差异摘要
 */
const { chromium } = require("@playwright/test");

const done = (ms) => new Promise((r) => setTimeout(r, ms));

/* 每页的双站选择器映射 */
const PAGES = [
  {
    name: "plp",
    ours: "http://localhost:3000/products",
    theirs: "https://shop.x.com/collections/all",
    sel: {
      ours: { card: "main a[href*='/products/']", media: "main a[href*='/products/'] img" },
      theirs: { card: "a[href*='/products/']", media: "a[href*='/products/'] img" },
    },
  },
  {
    name: "pdp",
    ours: "http://localhost:3000/products/grok-logo-tee",
    theirs: "https://shop.x.com/products/grok-logo-tee",
    sel: {
      ours: {
        media: "main .aspect-square",
        h1: "main h1",
        buyBtn: "main button[type='submit'], main button[class*='add']",
      },
      theirs: {
        media: ".product-gallery__media",
        h1: "main h1, h1",
        buyBtn: "button[name='add'], button[class*='product-form']",
      },
    },
  },
];

const STYLE_PROPS = ["backgroundColor", "borderRadius", "padding", "border"];
const TEXT_PROPS = ["fontSize", "fontWeight", "color"];

async function fingerprint(page, url, sel) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await done(3200);
  return page.evaluate(({ sel, STYLE_PROPS, TEXT_PROPS }) => {
    const pick = (el, props) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      const out = {};
      for (const p of props) out[p] = s[p];
      return out;
    };
    const q = (selector) => document.querySelector(selector);
    const result = { url: location.href, bodyBg: getComputedStyle(document.body).backgroundColor };

    if (sel.card) {
      const card = q(sel.card);
      result.card = pick(card, STYLE_PROPS);
      const img = card?.querySelector("img");
      result.media = img ? { ...pick(img, ["objectFit"]), parentBg: getComputedStyle(img.parentElement).backgroundColor } : null;
    }
    if (sel.media && !sel.card) {
      const m = q(sel.media);
      result.media = m ? pick(m, STYLE_PROPS) : null;
      const img = m?.querySelector("img");
      if (img) result.mediaFit = getComputedStyle(img).objectFit;
    }
    if (sel.h1) {
      result.h1 = pick(q(sel.h1), TEXT_PROPS);
    }
    if (sel.buyBtn) {
      let btn = q(sel.buyBtn);
      if (!btn) btn = [...document.querySelectorAll("main button")].find((b) => /add to cart|加入购物车/i.test(b.textContent));
      result.buyBtn = btn ? { ...pick(btn, ["backgroundColor", "color", "borderRadius", "height"]), text: btn.textContent.trim().slice(0, 24) } : null;
    }
    // 商品卡标题/价格（取第一张卡的文本子元素）
    const cardEl = sel.card ? q(sel.card) : null;
    if (cardEl) {
      const walker = document.createTreeWalker(cardEl, NodeFilter.SHOW_ELEMENT);
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim();
        if (!result.titleStyle && /^\$|¥/.test(node.textContent) === false && node.children.length === 0 && t.length > 8 && !/^[\d$,.\s]+$/.test(t)) {
          result.titleStyle = pick(node, TEXT_PROPS);
          result.titleText = t.slice(0, 30);
        }
        if (/^\$\d/.test(t.trim()) && !result.priceStyle) {
          result.priceStyle = pick(node, TEXT_PROPS);
        }
      }
    }
    return result;
  }, { sel, STYLE_PROPS, TEXT_PROPS });
}

function diff(name, path, a, b) {
  const issues = [];
  const walk = (va, vb, p) => {
    if (va == null || vb == null) {
      if (String(va) !== String(vb)) issues.push({ path: `${name}${p}`, theirs: va ?? "∅", ours: vb ?? "∅" });
      return;
    }
    if (typeof va === "object") {
      const keys = new Set([...Object.keys(va), ...Object.keys(vb)]);
      for (const k of keys) walk(va[k], vb[k], `${p}.${k}`);
    } else if (String(va) !== String(vb)) {
      issues.push({ path: `${name}${p}`, theirs: va, ours: vb });
    }
  };
  walk(a, b, "");
  return issues;
}

(async () => {
  const b = await chromium.launch(process.env.PW_PROXY?{proxy:{server:process.env.PW_PROXY}}:{});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: "Mozilla/5.0 Chrome/126" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(25000);

  const report = {};
  const allIssues = [];

  for (const pg of PAGES) {
    console.log(`\n=== ${pg.name} ===`);
    const theirsFp = await fingerprint(p, pg.theirs, pg.sel.theirs).catch((e) => ({ err: String(e).slice(0, 80) }));
    await done(400);
    const oursFp = await fingerprint(p, pg.ours, pg.sel.ours).catch((e) => ({ err: String(e).slice(0, 80) }));
    report[pg.name] = { theirs: theirsFp, ours: oursFp };
    const issues = diff(pg.name, "", theirsFp, oursFp).filter(
      (x) => !x.path.endsWith(".url") &&
        !(String(x.theirs).includes("∅") && String(x.ours).includes("undefined")) &&
        !(x.theirs === "∅" || x.ours === "∅") /* 选择器抓取失败=假阳性 */,
    );
    allIssues.push(...issues);
    for (const i of issues) console.log(`✗ ${i.path}: 原站=${JSON.stringify(i.theirs)} | 我站=${JSON.stringify(i.ours)}`);
    if (!issues.length) console.log("✓ 无差异");
  }

  fs = require("fs");
  fs.writeFileSync("/tmp/parity-report.json", JSON.stringify(report, null, 1));
  console.log(`\n==== 差异总计: ${allIssues.length} ====`);
  await b.close();
})();
