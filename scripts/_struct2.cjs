const { chromium } = require("@playwright/test");
const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const extract = `(() => {
  const t = (el) => el ? el.textContent.replace(/\\s+/g,' ').trim() : null;
  // header real bg chain
  const h = document.querySelector('header, x-header');
  let el = h, bg = null;
  while (el && !bg) { const b = getComputedStyle(el).backgroundColor; if (b !== 'rgba(0, 0, 0, 0)') bg = b; el = el.parentElement; }
  const collapsed = [];
  const walk = (node, depth) => {
    if (depth > 2) return;
    node.querySelectorAll(':scope > section, :scope > main > section, :scope > main > div, :scope > div[class*=section]').forEach(s => {
      const hh = t(s.querySelector('h1,h2'));
      const imgs = s.querySelectorAll('img').length;
      const links = [...s.querySelectorAll('a')].map(a=>t(a)).filter(Boolean).slice(0,6);
      collapsed.push({ cls: (s.className||'').slice(0,60), head: hh && hh.slice(0,40), imgs, links, h: Math.round(s.getBoundingClientRect().height) });
      walk(s, depth+1);
    });
  };
  const mains = document.querySelector('main') || document.body;
  walk(mains.parentElement === document.body ? mains.parentElement : document.body, 0);
  const prodTitles = [...document.querySelectorAll('a[href*="/products/"]')].map(a=>t(a)).filter(x=>x && x.length>2).slice(0,60);
  return { headerBg: bg || 'rgba(0,0,0,0)', headerText: t(h).replace(/\\n/g,' | ').slice(0,150), sections: collapsed.slice(0,20), prodTitles: [...new Set(prodTitles)].slice(0,50) };
})()`;
(async () => {
  const b = await chromium.launch({ proxy: { server: "http://127.0.0.1:10808" } });
  for (const [name, url] of [["LIVE-HOME","https://shop.x.com/"],["LOCAL-HOME","http://localhost:3000/"]]) {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: ua })).newPage();
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(2000);
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(1500);
    await p.evaluate(() => window.scrollTo(0, 0));
    const d = await p.evaluate(extract);
    console.log("\n=== " + name + " ===");
    console.log("headerBg:", d.headerBg, "\nheader:", d.headerText);
    console.log("SECTIONS:");
    d.sections.forEach(s => console.log("  -", JSON.stringify(s)));
    console.log("PRODUCTS:", d.prodTitles.join(" | "));
    await p.context().close();
  }
  await b.close();
})();
