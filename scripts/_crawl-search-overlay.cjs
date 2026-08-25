/* Crawl official header search interaction */
const { chromium } = require("@playwright/test");
const fs = require("fs");
(async () => {
  const b = await chromium.launch({ proxy: { server: "http://127.0.0.1:10808" } });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto("https://shop.x.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2500);
  // click header Search trigger
  const triggers = await p.evaluate(() => {
    const cands = [...document.querySelectorAll("header button, header a")].filter(e => /search/i.test(e.textContent + e.getAttribute("aria-label")));
    return cands.map(c => ({ tag: c.tagName, cls: (c.className||"").toString().slice(0,80), txt: c.textContent.trim().slice(0,30), aria: c.getAttribute("aria-label"), controls: c.getAttribute("aria-controls") }));
  });
  console.log("TRIGGERS:", JSON.stringify(triggers, null, 1));
  await p.click('header [aria-label*="earch"], header button:has-text("Search")').first?.() ?? null;
  // use playwright locator properly
  await p.locator("header").getByText("Search", { exact: false }).first().click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: "/tmp/xsearch/header-open.png" });
  const state = await p.evaluate(() => {
    // find newly visible search input
    const inputs = [...document.querySelectorAll("input")].filter(i => {
      const r = i.getBoundingClientRect();
      return r.width > 50 && r.height > 10 && i.type !== "hidden";
    }).map(i => {
      const r = i.getBoundingClientRect(); const s = getComputedStyle(i);
      return { ph: i.placeholder, aria: i.getAttribute("aria-label"), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fs: s.fontSize, border: s.border, bg: s.backgroundColor, cls: (i.className||"").toString().slice(0,60) };
    });
    // what container appeared? check elements near header bottom
    const dialogs = [...document.querySelectorAll("[role=dialog], .search-bar, [class*=search]")].filter(e => {
      const r = e.getBoundingClientRect(); return r.width > 200;
    }).map(e => {
      const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
      return { tag: e.tagName, id: e.id?.slice(0,40), cls: (e.className||"").toString().slice(0,70), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: s.position, bg: s.backgroundColor, z: s.zIndex };
    });
    return { inputs, containers: dialogs.slice(0, 8), bodyH: document.body.scrollHeight };
  });
  console.log("OPEN STATE:", JSON.stringify(state, null, 1));
  // type to see predictive suggestions
  const inp = p.locator("input[placeholder*='earch']").first();
  if (await inp.count()) {
    await inp.fill("tee");
    await p.waitForTimeout(2500);
    await p.screenshot({ path: "/tmp/xsearch/header-typed.png" });
    const sug = await p.evaluate(() => {
      const items = [...document.querySelectorAll("a[href*='/products/']")].filter(a => {
        const r = a.getBoundingClientRect(); return r.width > 100 && r.height > 40;
      }).map(a => { const r = a.getBoundingClientRect(); const s = getComputedStyle(a);
        return { txt: a.textContent.replace(/\s+/g," ").trim().slice(0,50), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bg: s.backgroundColor }; });
      return items.slice(0, 6);
    });
    console.log("SUGGESTIONS:", JSON.stringify(sug, null, 1));
  }
  await b.close();
})();
