/* Deep crawl: exact HTML snippets of header/footer/cards + PLP */
const { chromium } = require("@playwright/test");
const fs = require("fs");

const OUT = "/tmp/xcom";
(async () => {
  const browser = await chromium.launch(process.env.PW_PROXY?{proxy:{server:process.env.PW_PROXY}}:{});
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  });
  const page = await ctx.newPage();
  await page.goto("https://shop.x.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  const dump = await page.evaluate(() => {
    const clean = (html) => html.replace(/<style[\s\S]*?<\/style>/g, "<style>…</style>").replace(/<svg[\s\S]*?<\/svg>/g, "<svg/>").replace(/\s+/g, " ");

    // Announcement bar?
    const ann = document.querySelector('[class*="announcement"], shopify-section[class*="announcement"]');
    // Header element
    const header = document.querySelector("header");
    // Utility strip (country/login/search/cart)
    const utils = [...document.querySelectorAll("header a")].map((a) => ({
      text: a.textContent.replace(/\s+/g, " ").trim().slice(0, 40),
      href: a.getAttribute("href"),
      cls: (a.className || "").slice(0, 60),
    }));
    // Logo
    const logo = header?.querySelector("a[href='/'], h1, [class*='logo']");

    // Collection banners section
    const collSection = document.querySelector(".shopify-section--collection-list, [class*='collection-list']");
    // Product cards on home
    const homeCards = [...document.querySelectorAll("a[href*='/products/']")].slice(0, 4).map((a) => {
      const cardEl = a.closest("li, article, div");
      const s = cardEl ? getComputedStyle(cardEl) : null;
      return {
        href: a.getAttribute("href"),
        cardCls: cardEl ? (cardEl.className || "").toString().slice(0, 80) : null,
        bg: s?.backgroundColor,
        radius: s?.borderRadius,
        text: a.textContent.replace(/\s+/g, " ").trim().slice(0, 80),
        innerHTML: clean(a.innerHTML).slice(0, 500),
      };
    });
    // All products heading style
    const h2 = [...document.querySelectorAll("h2")].find((h) => /all products/i.test(h.textContent));
    const h2s = h2 ? getComputedStyle(h2) : null;

    // Footer
    const footer = document.querySelector("footer");

    return {
      announcement: ann ? clean(ann.outerHTML).slice(0, 400) : null,
      headerTag: header ? header.tagName : null,
      headerSnippet: header ? clean(header.outerHTML).slice(0, 2500) : null,
      headerBg: header ? getComputedStyle(header).backgroundColor : null,
      headerH: header ? header.getBoundingClientRect().height : null,
      utils,
      logoText: logo ? logo.textContent.replace(/\s+/g, " ").trim().slice(0, 60) : null,
      logoStyles: logo ? (({ fontSize, fontWeight, fontFamily }) => ({ fontSize, fontWeight, fontFamily }))(getComputedStyle(logo)) : null,
      collSectionSnippet: collSection ? clean(collSection.outerHTML).slice(0, 2000) : null,
      homeCards,
      allProductsHeading: h2 ? { text: h2.textContent.trim(), fontSize: h2s.fontSize, weight: h2s.fontWeight, align: h2s.textAlign, transform: h2s.textTransform, mb: h2s.marginBottom } : null,
      footerSnippet: footer ? clean(footer.outerHTML).slice(0, 2200) : null,
      footerBg: footer ? getComputedStyle(footer).backgroundColor : null,
    };
  });
  fs.writeFileSync(`${OUT}/deep.json`, JSON.stringify(dump, null, 2));

  console.log("ANNOUNCEMENT:", dump.announcement ? dump.announcement.slice(0, 150) : "none");
  console.log("\nHEADER BG:", dump.headerBg, "| HEIGHT:", Math.round(dump.headerH) + "px");
  console.log("\nUTILS:", JSON.stringify(dump.utils.slice(0, 8), null, 1));
  console.log("\nLOGO:", dump.logoText, JSON.stringify(dump.logoStyles));
  console.log("\nH2:", JSON.stringify(dump.allProductsHeading));
  console.log("\nCARD[0]:", JSON.stringify(dump.homeCards[0], null, 1)?.slice(0, 900));
  console.log("\nFOOTER BG:", dump.footerBg);
  console.log("FOOTER TEXT:", dump.footerSnippet?.slice(0, 600));

  // Try PLP via /collections/all
  try {
    await page.goto("https://shop.x.com/collections/all", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/x-plp.png`, timeout: 60000 });
    const plp = await page.evaluate(() => {
      const banner = document.querySelector("[class*='collection-banner'], [class*='hero']");
      const sort = document.querySelector("select");
      const card = document.querySelector("a[href*='/products/']");
      const grid = document.querySelector("ul, [class*='product-list']");
      return {
        title: document.title,
        banner: banner ? banner.textContent.replace(/\s+/g, " ").trim().slice(0, 120) : null,
        bannerBg: banner ? getComputedStyle(banner).backgroundColor : null,
        sortOptions: sort ? [...sort.options].map((o) => o.textContent.trim()).slice(0, 8) : null,
        firstCard: card ? card.closest("li")?.textContent.replace(/\s+/g, " ").trim().slice(0, 120) : null,
        gridCols: grid ? getComputedStyle(grid).display : null,
      };
    });
    fs.writeFileSync(`${OUT}/plp.json`, JSON.stringify(plp, null, 2));
    console.log("\nPLP:", JSON.stringify(plp, null, 1));
  } catch (e) {
    console.log("PLP FAIL:", e.message.slice(0, 100));
  }
  await browser.close();
})();
