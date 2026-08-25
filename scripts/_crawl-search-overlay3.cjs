const { chromium } = require("@playwright/test");
(async () => {
  const b = await chromium.launch({ proxy: { server: "http://127.0.0.1:10808" } });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto("https://shop.x.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('header a[aria-controls^="header-search"]')?.click());
  await p.waitForTimeout(1200);
  await p.screenshot({ path: "/tmp/xsearch/header-open.png" });
  const state = await p.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fs: s.fontSize, color: s.color, bg: s.backgroundColor }; };
    const input = [...document.querySelectorAll("input[name=q], input[type=search]")].find(i => i.getBoundingClientRect().width > 100);
    let bar = input?.closest("[id*=header-search], [class*=header-search]");
    while (bar && bar.getBoundingClientRect().width < 400) bar = bar.parentElement;
    const barStyle = bar ? getComputedStyle(bar) : null;
    return {
      input: input && box(input),
      bar: bar && { ...box(bar), pos: barStyle.position, top: barStyle.top, bottom: barStyle.bottom, bg: barStyle.backgroundColor, borderBottom: `${barStyle.borderTopWidth} ${barStyle.borderBottomWidth}`, z: barStyle.zIndex, cls: (bar.className||"").toString().slice(0,70) },
      bodyH: document.body.scrollHeight,
      snippet: document.body.innerText.replace(/\s+/g," ").slice(0,180),
    };
  });
  console.log("OPEN:", JSON.stringify(state, null, 1));
  await p.fill('input[type="search"]', "tee");
  await p.waitForTimeout(2800);
  await p.screenshot({ path: "/tmp/xsearch/header-typed.png" });
  const sug = await p.evaluate(() => {
    const links = [...document.querySelectorAll("a[href*='/products/']")].filter(a => { const r = a.getBoundingClientRect(); return r.width > 120 && r.y > 60 && r.height > 30; });
    const items = links.slice(0,5).map(a => { const r = a.getBoundingClientRect(); return { txt: a.textContent.replace(/\s+/g," ").trim().slice(0,40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
    // suggestion list container style
    let cont = links[0]?.parentElement; while (cont && cont.getBoundingClientRect().width < 400) cont = cont.parentElement;
    const cs = cont ? getComputedStyle(cont) : null;
    const headings = [...document.querySelectorAll("*")].filter(e => e.children.length===0 && /results? for|suggestion/i.test(e.textContent)).map(e=>e.textContent.replace(/\s+/g," ").trim().slice(0,50));
    return { items, contCls: cont && (cont.className||"").toString().slice(0,60), contBg: cs?.backgroundColor, contW: cont && Math.round(cont.getBoundingClientRect().width), headings };
  });
  console.log("SUGGESTIONS:", JSON.stringify(sug, null, 1));
  await b.close();
})();
