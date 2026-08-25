const { chromium } = require("@playwright/test");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("https://shop.x.com/products/xai-multi-tumbler", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/tmp/xcom/x-pdp.png", timeout: 60000 });
  const data = await page.evaluate(() => {
    const clean = (h) => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "<svg/>").replace(/\s+/g, " ");
    // buy buttons
    const btns = [...document.querySelectorAll("button")].filter((b) => /add to (cart|bag)|buy|checkout|sold out/i.test(b.textContent)).slice(0, 4);
    const buyButtons = btns.map((b) => {
      const s = getComputedStyle(b);
      return { text: b.textContent.replace(/\s+/g, " ").trim().slice(0, 40), bg: s.backgroundColor, color: s.color, radius: s.borderRadius, border: s.border, padding: s.padding, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) };
    });
    // title/price
    const h1 = document.querySelector("h1");
    const h1s = h1 ? getComputedStyle(h1) : null;
    const prices = [...document.querySelectorAll("[class*='price']")].slice(0, 3).map((p) => ({ text: p.textContent.replace(/\s+/g, " ").trim().slice(0, 50), size: getComputedStyle(p).fontSize }));
    // variant pills
    const pills = [...document.querySelectorAll("[class*='variant'] button, [class*='swatch'], [class*='option'] input + label, fieldset label")].slice(0, 5).map((l) => {
      const s = getComputedStyle(l);
      return { text: l.textContent.trim().slice(0, 20), border: s.border, radius: s.borderRadius, padding: s.padding };
    });
    // gallery layout
    const gallery = document.querySelector("[class*='product-gallery'], [class*='gallery']");
    const mediaEls = [...document.querySelectorAll("[class*='product'] img")].slice(0, 3).map((i) => ({ w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height) }));
    return {
      title: h1?.textContent.trim(),
      titleStyle: h1s ? { size: h1s.fontSize, weight: h1s.fontWeight, align: h1s.textAlign } : null,
      buyButtons,
      prices,
      pills,
      galleryCls: gallery ? gallery.className.slice(0, 60) : null,
      mediaEls,
      snippet: clean(document.querySelector(".shopify-section--main-product, main, body")?.innerHTML || "").slice(0, 1200),
    };
  });
  fs.writeFileSync("/tmp/xcom/pdp.json", JSON.stringify(data, null, 2));
  console.log("TITLE:", data.title, JSON.stringify(data.titleStyle));
  console.log("BUY:", JSON.stringify(data.buyButtons, null, 1));
  console.log("PRICE:", JSON.stringify(data.prices));
  console.log("PILLS:", JSON.stringify(data.pills, null, 1));
  await browser.close();
})();
