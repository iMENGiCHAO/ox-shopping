const { chromium } = require("@playwright/test");
(async () => {
  const b = await chromium.launch({ proxy: { server: "http://127.0.0.1:10808" } });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto("https://shop.x.com/products/the-core-tee", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(3500);
  const d = await p.evaluate(() => {
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fs: s.fontSize, fw: s.fontWeight, color: s.color, align: s.textAlign }; };
    // 找标题
    const heading = [...document.querySelectorAll("h2,h3,p")].find(e => /you may also like/i.test(e.textContent || ""));
    // 找所在 section
    let sec = heading; while (sec && sec.getBoundingClientRect().height < 300) sec = sec.parentElement;
    // 该区域内的商品链接（排除主购买区）
    const inSec = sec ? [...sec.querySelectorAll("a[href*='/products/']")] : [];
    const titles = [...new Set(inSec.map(a => {
      const t = a.querySelector("[class*=title], h3, .product-item__title") || a;
      return t.textContent.replace(/\s+/g," ").trim();
    }))].filter(t => t && !/add to cart/i.test(t)).slice(0, 12);
    // 第一张卡片的解剖
    const firstCard = inSec[0];
    let cardAnatomy = null;
    if (firstCard) {
      const img = firstCard.querySelector("img");
      const titleEl = firstCard.querySelector("[class*=title], h3");
      const priceEl = [...firstCard.querySelectorAll("*")].reverse().find(e => /^\$\d/.test((e.textContent||"").trim()));
      cardAnatomy = {
        linkCls: (firstCard.className||"").toString().slice(0,60),
        imgBox: img && box(img),
        title: titleEl && { ...box(titleEl), txt: titleEl.textContent.replace(/\s+/g," ").trim().slice(0,30) },
        price: priceEl && { ...box(priceEl.parentElement), txt: priceEl.textContent.replace(/\s+/g," ").trim() },
        onSaleBadge: !!firstCard.querySelector("[class*=sale], [class*=badge]"),
      };
    }
    return {
      headingTxt: heading && heading.textContent.replace(/\s+/g," ").trim(),
      headingStyle: box(heading),
      headingCls: heading && (heading.className||"").toString().slice(0,60),
      sectionH: sec && Math.round(sec.getBoundingClientRect().height),
      productCount: titles.length,
      titles,
      cardAnatomy,
      hasArrows: !!sec && [...sec.querySelectorAll("button")].filter(b => /prev|next|arrow/i.test(b.getAttribute("aria-label")||b.className)).length,
    };
  });
  console.log(JSON.stringify(d, null, 1));
  await p.screenshot({ path: "/tmp/xcom/related-official.png", fullPage: false });
  // 滚动到该区域截图
  const secY = d.headingStyle?.y ?? 0;
  if (secY > 400) { await p.evaluate((y) => window.scrollTo(0, y - 150), secY); await p.waitForTimeout(1200); await p.screenshot({ path: "/tmp/xsearch/related-section.png" }); }
  await b.close();
})();
