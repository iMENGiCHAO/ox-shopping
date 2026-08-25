const { chromium } = require("@playwright/test");
const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const extract = `(() => {
  const t = (el) => el ? el.textContent.replace(/\\s+/g,' ').trim() : null;
  const head = document.querySelector('header') || document.querySelector('[class*=header]');
  const navLinks = [...document.querySelectorAll('header a, nav a')].map(a=>t(a)).filter(Boolean).slice(0,30);
  const footerLinks = [...document.querySelectorAll('footer a')].map(a=>t(a)).filter(Boolean);
  const cards = document.querySelectorAll('a[href*="/products/"]').length;
  const h1 = document.querySelector('h1');
  const hs = head ? getComputedStyle(head) : null;
  const ann = document.querySelector('[class*=announcement]');
  return {
    title: document.title, h1: t(h1), cardCount: cards,
    headerBg: hs && hs.backgroundColor, headerH: head && Math.round(head.getBoundingClientRect().height),
    navLinks, footerLinks: footerLinks.slice(0,40),
    annText: ann && t(ann) ? t(ann).slice(0,80) : null,
    bodyH: document.body.scrollHeight,
  };
})()`;
(async () => {
  const b = await chromium.launch({ proxy: { server: "http://127.0.0.1:10808" } });
  const cases = [
    ["https://shop.x.com/", "http://localhost:3000/"],
    ["https://shop.x.com/collections/all", "http://localhost:3000/products"],
    ["https://shop.x.com/products/xai-multi-tumbler", "http://localhost:3000/products/grok-logo-tee"],
    ["https://shop.x.com/cart", "http://localhost:3000/cart"],
    ["https://shop.x.com/account/login", "http://localhost:3000/auth/login"],
    ["https://shop.x.com/search?q=tee", "http://localhost:3000/search?q=tee"],
  ];
  const out = {};
  for (const pair of cases) {
    const row = [];
    for (const url of pair) {
      const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: ua })).newPage();
      try { await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForTimeout(1500);
        row.push(await p.evaluate(extract)); }
      catch (e) { row.push({ error: e.message.slice(0, 80) }); }
      await p.context().close();
    }
    out[pair[0].split("/").pop() || "home"] = row;
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
