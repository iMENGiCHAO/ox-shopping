/* Crawl shop.x.com/search: empty + queried states -> screenshot + structure */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";
(async () => {
  const b = await chromium.launch({ proxy: { server: "http://127.0.0.1:10808" } });
  const out = "/tmp/xsearch";
  fs.mkdirSync(out, { recursive: true });
  for (const [name, url] of [
    ["empty", "https://shop.x.com/search"],
    ["q-tee", "https://shop.x.com/search?q=tee"],
    ["q-hoodie", "https://shop.x.com/search?q=hoodie"],
    ["q-noresult", "https://shop.x.com/search?q=zzzznotexist"],
  ]) {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: ua })).newPage();
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `${out}/${name}.png` });
    const d = await p.evaluate(() => {
      const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
      const styleOf = (el) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color, size: s.fontSize, weight: s.fontWeight, align: s.textAlign, border: s.border, radius: s.borderRadius, pad: s.padding };
      };
      const input = document.querySelector('input[type="search"], input[name="q"], form input[type="text"]');
      const cards = [...document.querySelectorAll('a[href*="/products/"]')];
      const titles = [...new Set(cards.map(c => t(c)).filter(x => x && x.length > 2))];
      const h1s = [...document.querySelectorAll("h1,h2")].map(h => ({ tag: h.tagName, txt: t(h)?.slice(0, 60), ...styleOf(h), w: Math.round(h.getBoundingClientRect().width) }));
      const sortEl = [...document.querySelectorAll("select,button")].find(e => /sort|featured/i.test(e.textContent || e.getAttribute("aria-label") || ""));
      return {
        title: document.title,
        url: location.href,
        input: input ? { ph: input.placeholder, aria: input.getAttribute("aria-label"), value: input.value, ...styleOf(input), w: Math.round(input.getBoundingClientRect().width), h: Math.round(input.getBoundingClientRect().height) } : null,
        headings: h1s,
        resultCount: cards.length,
        productTitles: titles.slice(0, 30),
        sortText: sortEl ? t(sortEl)?.slice(0, 40) : null,
        bodySnippet: document.body.innerText.replace(/\s+/g, " ").slice(0, 400),
        bodyH: document.body.scrollHeight,
      };
    });
    fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(d, null, 1));
    console.log("=====", name, "=====");
    console.log(JSON.stringify(d, null, 1).slice(0, 1500));
    await p.context().close();
  }
  await b.close();
})();
