/* Master crawl: every key page of shop.x.com -> screenshot + structure + image URLs */
const { chromium } = require("@playwright/test");
const fs = require("fs");

const OUT = "/tmp/xcom";
fs.mkdirSync(OUT, { recursive: true });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";

async function inspect(page, name, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 60000 });

  const d = await page.evaluate(() => {
    const pick = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 100) : null);
    const styleOf = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, color: s.color, size: s.fontSize, weight: s.fontWeight, align: s.textAlign, radius: s.borderRadius, padding: s.padding, border: s.border };
    };

    const h1 = document.querySelector("h1:not(.header__logo)");
    const buttons = [...document.querySelectorAll("button, a[class*='button'], [role='button']")]
      .filter((b) => b.offsetParent !== null)
      .slice(0, 12)
      .map((b) => ({ text: pick(b)?.slice(0, 40), ...styleOf(b), w: Math.round(b.getBoundingClientRect().width) }));

    const inputs = [...document.querySelectorAll("input, select, textarea")].slice(0, 8).map((i) => ({
      type: i.type || i.tagName.toLowerCase(), ph: i.placeholder || null, ...styleOf(i),
    }));

    const imgs = [...document.querySelectorAll("img")]
      .map((i) => i.src)
      .filter((s) => s && s.includes("cdn/shop"))
      .slice(0, 20);

    const cardCount = document.querySelectorAll("a[href*='/products/']").length;

    return {
      title: document.title,
      h1: h1 ? { text: pick(h1), ...styleOf(h1) } : null,
      buttons,
      inputs,
      imgs,
      cardCount,
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });

  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(d, null, 2));
  console.log(`\n##### ${name} (${url})`);
  console.log("title:", d.title, "| bodyBg:", d.bodyBg, "| productLinks:", d.cardCount);
  console.log("h1:", JSON.stringify(d.h1));
  console.log("buttons:", JSON.stringify(d.buttons.slice(0, 5)));
  console.log("inputs:", JSON.stringify(d.inputs.slice(0, 4)));
  console.log("imgs:", d.imgs.slice(0, 6).join("\n  "));
  return d;
}

(async () => {
  const browser = await chromium.launch(process.env.PW_PROXY ? { proxy: { server: process.env.PW_PROXY } } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA });
  const page = await ctx.newPage();

  // 1. Homepage — collect collection banners + product handles
  const home = await inspect(page, "pg-home", "https://shop.x.com/");

  // product handles from home
  const handles = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll("a[href*='/products/']")].map((a) => a.getAttribute("href").split("/products/")[1].split("?")[0]))].slice(0, 12),
  );
  console.log("HANDLES:", handles.join(", "));

  // 2. Collection page (x-collection)
  await inspect(page, "pg-collection", "https://shop.x.com/collections/x-collection");

  // 3. Search page
  await inspect(page, "pg-search", "https://shop.x.com/search?q=tumbler");

  // 4. Login
  await inspect(page, "pg-login", "https://shop.x.com/account/login");

  // 5. Register
  await inspect(page, "pg-register", "https://shop.x.com/account/register");

  // 6. Cart
  await inspect(page, "pg-cart", "https://shop.x.com/cart");

  // 7. PDPs — capture layout + all images per product
  const pdpImages = {};
  for (const h of handles.slice(0, 10)) {
    try {
      const d = await inspect(page, `pdp-${h}`, `https://shop.x.com/products/${h}`);
      pdpImages[h] = d.imgs;
    } catch (e) {
      console.log(`PDP fail ${h}: ${e.message.slice(0, 60)}`);
    }
  }

  // 8. Open cart drawer state on PDP (add to cart flow visual) — skip actual add; just note
  fs.writeFileSync(`${OUT}/pdp-images.json`, JSON.stringify(pdpImages, null, 2));
  console.log("\nDONE. Files in", OUT);
  await browser.close();
})();
