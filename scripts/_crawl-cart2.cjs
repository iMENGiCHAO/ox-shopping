const { chromium } = require("@playwright/test");
(async () => {
  const b = await chromium.launch({ proxy: { server: "http://127.0.0.1:10808" } });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("https://shop.x.com/products/xai-multi-tumbler", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(3000);
  const btns = await p.evaluate(() =>
    [...document.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 40).map(b => b.textContent.replace(/\s+/g," ").trim().slice(0,30)).slice(0,12));
  console.log("PDP BUTTONS:", JSON.stringify(btns));
  // click whatever looks like add
  const clicked = await p.evaluate(() => {
    const cand = [...document.querySelectorAll("button")].find(b => /add to cart/i.test((b.textContent||"").trim())) ||
                 [...document.querySelectorAll("button[type=submit]")].pop();
    if (!cand) return "none";
    cand.click(); return cand.textContent.replace(/\s+/g," ").trim().slice(0,30);
  });
  console.log("CLICKED:", clicked);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: "/tmp/xcart/after-add.png" });
  console.log("CART COUNT:", await p.evaluate(() => document.body.innerText.match(/Cart\s*\(?(\d+)\)?/i)?.[1] ?? "?"));
  // now full cart page
  await p.goto("https://shop.x.com/cart", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: "/tmp/xcart/filled.png", fullPage: true });
  const d = await p.evaluate(() => {
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fs: s.fontSize, color: s.color }; };
    const items = [...document.querySelectorAll("[class*=cart-item], [class*=line-item]")].filter(e => e.getBoundingClientRect().height > 60);
    const first = items[0];
    const img = first?.querySelector("img");
    const qtyInput = document.querySelector("input[name*='quantity'], input[class*=quantity], select[name*='quantity']");
    const removeBtns = [...document.querySelectorAll("a,button")].filter(e => /^remove$/i.test(e.textContent.trim()));
    const checkout = [...document.querySelectorAll("button,a")].find(e => /check\s*out/i.test(e.textContent));
    const subtotalRow = [...document.querySelectorAll("div,p,span")].filter(e => e.children.length <= 2 && /subtotal/i.test(e.textContent || "") && e.textContent.length < 60)[0];
    const noteField = document.querySelector("textarea, input[name*='note']");
    return {
      title: document.title,
      headings: [...document.querySelectorAll("h1,h2")].map(h => ({ t: h.textContent.trim().slice(0,40), ...box(h) })),
      itemCount: items.length,
      firstItemCls: first && (first.className||"").toString().slice(0,90),
      imgBox: img && box(img),
      qty: qtyInput && { tag: qtyInput.tagName, ...box(qtyInput) },
      remove: removeBtns[0] && box(removeBtns[0]),
      checkout: checkout && { tag: checkout.tagName, t: checkout.textContent.replace(/\s+/g," ").trim(), ...box(checkout) },
      subtotal: subtotalRow && { t: subtotalRow.textContent.replace(/\s+/g," ").trim(), ...box(subtotalRow) },
      note: noteField && box(noteField),
      snippet: document.body.innerText.replace(/\s+/g," ").slice(0,700),
    };
  });
  console.log(JSON.stringify(d, null, 1));
  await b.close();
})();
