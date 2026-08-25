const { chromium } = require("@playwright/test");
const fs = require("fs");
(async () => {
  const b = await chromium.launch({ proxy: { server: "http://127.0.0.1:10808" } });
  fs.mkdirSync("/tmp/xcart", { recursive: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  // ---- EMPTY ----
  await p.goto("https://shop.x.com/cart", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: "/tmp/xcart/empty.png" });
  const empty = await p.evaluate(() => {
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fs: s.fontSize, fw: s.fontWeight, color: s.color, align: s.textAlign }; };
    return {
      title: document.title,
      headings: [...document.querySelectorAll("h1,h2")].map(h => ({ t: h.textContent.trim().slice(0,40), ...box(h) })),
      buttons: [...document.querySelectorAll("a.button,button")].filter(e => e.getBoundingClientRect().width > 50).map(e => ({ t: e.textContent.replace(/\s+/g," ").trim().slice(0,30), ...box(e) })).slice(0,6),
      snippet: document.body.innerText.replace(/\s+/g," ").slice(0,300),
      bodyH: document.body.scrollHeight,
    };
  });
  console.log("EMPTY:", JSON.stringify(empty, null, 1));

  // ---- FILLED: add first available product from PDP ----
  await p.goto("https://shop.x.com/products/the-core-tee", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2500);
  // pick first available size option then add
  const addResult = await p.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const add = btns.find(b => /add to cart/i.test(b.textContent));
    if (add) { add.click(); return "clicked-add"; }
    return "no-add-btn";
  });
  console.log("ADD:", addResult);
  await p.waitForTimeout(2000);
  await p.goto("https://shop.x.com/cart", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: "/tmp/xcart/filled.png", fullPage: true });
  const filled = await p.evaluate(() => {
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fs: s.fontSize, fw: s.fontWeight, color: s.color, bg: s.backgroundColor, border: s.border }; };
    const row = document.querySelector("[class*=cart-item], [class*=line-item], li");
    const qty = document.querySelector("input[type=number], [class*=quantity] input, select[class*=quantity]");
    const links = [...document.querySelectorAll("a[href*='/checkout'], button")].filter(e => /check\s*out/i.test(e.textContent));
    const subtotal = [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && /subtotal|total/i.test(e.textContent || "")).map(e => e.textContent.replace(/\s+/g," ").trim().slice(0,40)).slice(0,5);
    return {
      title: document.title,
      headings: [...document.querySelectorAll("h1,h2")].map(h => ({ t: h.textContent.trim().slice(0,40), ...box(h) })),
      rowBox: row && box(row),
      rowCls: row && (row.className||"").toString().slice(0,80),
      qtyBox: qty && box(qty),
      checkoutBtn: links[0] && { t: links[0].textContent.replace(/\s+/g," ").trim(), ...box(links[0]) },
      subtotalTexts: subtotal,
      snippet: document.body.innerText.replace(/\s+/g," ").slice(0,600),
    };
  });
  console.log("FILLED:", JSON.stringify(filled, null, 1));
  await b.close();
})();
