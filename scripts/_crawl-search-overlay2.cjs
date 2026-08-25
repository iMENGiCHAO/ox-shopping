const { chromium } = require("@playwright/test");
(async () => {
  const b = await chromium.launch({ proxy: { server: "http://127.0.0.1:10808" } });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto("https://shop.x.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2500);
  // click the anchor whose aria-controls starts with header-search
  await p.click('header a[aria-controls^="header-search"]');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: "/tmp/xsearch/header-open.png" });
  const state = await p.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fs: s.fontSize, border: s.borderBottom, bg: s.backgroundColor }; };
    const input = [...document.querySelectorAll("input[name=q], input[type=search]")].find(i => i.getBoundingClientRect().width > 100);
    // the bar container
    let bar = input?.closest("[id*=header-search], [class*=header-search]");
    while (bar && bar.getBoundingClientRect().width < 400) bar = bar.parentElement;
    const closeBtn = [...document.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 0 && /close|×/i.test(b.textContent + b.getAttribute("aria-label"))).map(b => { const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; });
    const barStyle = bar ? getComputedStyle(bar) : null;
    return {
      input: input && box(input),
      bar: bar && { ...box(bar), pos: barStyle.position, top: barStyle.top, bg: barStyle.backgroundColor, borderBottom: barStyle.borderBottom, z: barStyle.zIndex, cls: (bar.className||"").toString().slice(0,80) },
      closeBtn,
      bodyH: document.body.scrollHeight,
      snippet: document.body.innerText.replace(/\s+/g," ").slice(0,200),
    };
  });
  console.log("OPEN:", JSON.stringify(state, null, 1));
  // type for predictive suggestions
  await p.fill('input[type="search"]', "tee");
  await p.waitForTimeout(2500);
  await p.screenshot({ path: "/tmp/xsearch/header-typed.png" });
  const sug = await p.evaluate(() => {
    const region = document.querySelector("[aria-controls*='live-region'], [id*='search-results-live-region']")?.parentElement;
    const items = [...document.querySelectorAll("a[href*='/products/']")].filter(a => { const r = a.getBoundingClientRect(); return r.width > 150 && r.y > 60; })
      .map(a => { const r = a.getBoundingClientRect(); const s = getComputedStyle(a);
        return { txt: a.textContent.replace(/\s+/g," ").trim().slice(0,40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
    const heading = [...document.querySelectorAll("p,h2,h3,span")].filter(e => /result/i.test(e.textContent) && e.textContent.length < 60).map(e => e.textContent.replace(/\s+/g," ").trim().slice(0,50));
    return { items: items.slice(0,5), headings: heading.slice(0,3), regionCls: region && (region.className||"").toString().slice(0,60) };
  });
  console.log("SUGGESTIONS:", JSON.stringify(sug, null, 1));
  await b.close();
})();
