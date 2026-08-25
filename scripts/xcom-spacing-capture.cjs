/**
 * xcom-spacing-capture.cjs — 抓取 shop.x.com 桌面端(1440)间距/排版基准，存 /tmp/xcom-spacing.json
 */
const { chromium } = require("@playwright/test");
const done = (ms) => new Promise((r) => setTimeout(r, ms));

async function gotoSettle(p, url) {
  for (let i = 0; i < 2; i++) {
    try {
      await p.goto(url, { waitUntil: "load", timeout: 90000 });
      await done(4500);
      return;
    } catch {
      await done(2500);
    }
  }
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: "Mozilla/5.0 Chrome/126" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(25000);
  const out = {};

  // ── 首页 ──
  await gotoSettle(p, "https://shop.x.com/");
  out.home = await p.evaluate(() => {
    const s = (e) => (e ? getComputedStyle(e) : null);
    const num = (v) => parseFloat(v || "0");
    const header = document.querySelector("header, .shopify-section-header sticky-header");
    const sections = [...document.querySelectorAll("main section, .shopify-section section")].filter((x) => x.getBoundingClientRect().height > 200);
    const grids = [...document.querySelectorAll("[class*='product-list'], ul[class*='grid'], [class*='product-grid']")]
      .filter((g) => s(g).display === "grid" && g.getBoundingClientRect().width > 800);
    const heroImg = document.querySelector("main img");
    return {
      headerH: header ? Math.round(header.getBoundingClientRect().height) : null,
      heroFirstSectionH: sections[0] ? Math.round(sections[0].getBoundingClientRect().height) : null,
      sectionPads: sections.slice(0, 4).map((x) => `${num(s(x).paddingTop)}+${num(s(x).paddingBottom)}`),
      gridCols: grids[0] ? s(grids[0]).gridTemplateColumns.split(" ").length : null,
      gridGap: grids[0] ? `${num(s(grids[0]).columnGap)}/${num(s(grids[0]).rowGap)}` : null,
      containerPadX: document.querySelector("main > *") ? num(s(document.querySelector("main > *")).paddingLeft) || num(s(document.body).paddingLeft) : null,
      bodyMaxW: (() => { const w = document.querySelector(".shopify-section ~ * , body > div"); return w ? s(w).maxWidth : null; })(),
    };
  }).catch((e) => ({ err: String(e).slice(0, 60) }));
  console.log("home:", JSON.stringify(out.home));

  // ── PLP ──
  await gotoSettle(p, "https://shop.x.com/collections/all");
  out.plp = await p.evaluate(() => {
    const s = (e) => (e ? getComputedStyle(e) : null);
    const num = (v) => parseFloat(v || "0");
    const card = [...document.querySelectorAll("a[href*='/products/']")].find((c) => c.querySelector("img") && c.getBoundingClientRect().height > 150);
    let grid = card?.parentElement;
    while (grid && s(grid).display !== "grid") grid = grid.parentElement;
    const cardRoot = card?.closest("[class*='product-card'], li") ?? card;
    // 卡内文本块：含 $ 的节点向上最近的 padding 容器
    let priceEl = null, titleEl = null;
    const walker = document.createTreeWalker(cardRoot ?? card, NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.textContent.trim();
      if (!titleEl && t.length > 10 && n.children.length === 0 && !/^[\d$.,\s]+$/.test(t)) titleEl = n;
      if (!priceEl && /^\$\d/.test(t)) priceEl = n;
    }
    const txtBox = titleEl?.parentElement;
    return {
      gridCols: grid ? s(grid).gridTemplateColumns.split(" ").length : null,
      gapX: grid ? num(s(grid).columnGap) : null,
      gapY: grid ? num(s(grid).rowGap) : null,
      sectionPadY: grid?.parentElement ? `${num(s(grid.parentElement).paddingTop)}+${num(s(grid.parentElement).paddingBottom)}` : null,
      cardTextPadX: txtBox ? num(s(txtBox).paddingLeft) : null,
      cardTextPadTop: txtBox ? num(s(txtBox).paddingTop) : null,
      titleFs: titleEl ? s(titleEl).fontSize : null,
      titleLh: titleEl ? num(s(titleEl).lineHeight) : null,
      priceFs: priceEl ? s(priceEl).fontSize : null,
      imgToTextGap: (() => {
        const img = card?.querySelector("img");
        if (!img || !txtBox) return null;
        return Math.round(txtBox.getBoundingClientRect().top - img.closest("div").getBoundingClientRect().bottom);
      })(),
      cardW: cardRoot ? Math.round(cardRoot.getBoundingClientRect().width) : null,
    };
  }).catch((e) => ({ err: String(e).slice(0, 60) }));
  console.log("plp:", JSON.stringify(out.plp));

  // ── PDP ──
  await gotoSettle(p, "https://shop.x.com/products/grok-logo-tee");
  out.pdp = await p.evaluate(() => {
    const s = (e) => (e ? getComputedStyle(e) : null);
    const num = (v) => parseFloat(v || "0");
    const gal = document.querySelector(".product-gallery");
    const thumbs = document.querySelector(".product-gallery__thumb-list") ?? document.querySelector("[class*='thumbnail']");
    const media = document.querySelector(".product-gallery__media-list") ?? document.querySelector(".product-gallery__media");
    const h1 = document.querySelector("h1");
    const price = [...document.querySelectorAll("[class*='price']")].find((x) => /^\$\d/.test(x.textContent.trim()));
    const btn = [...document.querySelectorAll("button")].find((x) => /add/i.test(x.textContent));
    const infoRoot = h1?.closest("[class*='product-info']");
    // 信息列块间距：h1 与下一可见块的距离
    const rectOf = (el) => el?.getBoundingClientRect();
    return {
      galleryDisplay: gal ? s(gal).display : null,
      thumbPosition: thumbs ? s(thumbs).position : null,
      thumbTop: thumbs ? s(thumbs).top : null,
      thumbW: thumbs ? Math.round(rectOf(thumbs).width) : null,
      mediaW: media ? Math.round(rectOf(media).width) : null,
      galToInfoGap: (() => {
        if (!gal || !infoRoot) return null;
        return Math.round(rectOf(infoRoot).left - rectOf(gal).right);
      })(),
      h1Fs: h1 ? s(h1).fontSize : null,
      h1Mb: h1 ? num(s(h1).marginBottom) : null,
      priceFs: price ? s(price).fontSize : null,
      btnH: btn ? Math.round(rectOf(btn).height) : null,
      btnMt: (() => { let el = btn; while (el && num(s(el).marginTop) === 0) el = el.parentElement; return el ? num(s(el).marginTop) : null; })(),
      docScrollH: document.body.scrollHeight,
    };
  }).catch((e) => ({ err: String(e).slice(0, 60) }));
  console.log("pdp:", JSON.stringify(out.pdp));

  require("fs").writeFileSync("/tmp/xcom-spacing.json", JSON.stringify(out, null, 1));
  console.log("SAVED /tmp/xcom-spacing.json");
  await b.close();
})();
