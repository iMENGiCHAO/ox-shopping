/* Crawl shop.x.com: screenshots + DOM structure + style tokens */
const { chromium } = require("@playwright/test");
const fs = require("fs");

const OUT = "/tmp/xcom";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  });
  const page = await ctx.newPage();
  try {
    await page.goto("https://shop.x.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2500);

    await page.screenshot({ path: `${OUT}/x-home-full.png`, fullPage: true, timeout: 60000 });
    await page.screenshot({ path: `${OUT}/x-home-viewport.png`, timeout: 60000 });

    // Structure dump
    const data = await page.evaluate(() => {
      const pick = (el) =>
        el ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 120) : null;

      // Header
      const header = document.querySelector("header") || document.querySelector("shopify-section-header, .site-header");
      const headerHTMLLen = header ? header.outerHTML.length : 0;
      const headerText = pick(header);
      const navLinks = [...document.querySelectorAll("header a, header nav a")].slice(0, 25).map((a) => ({
        text: pick(a),
        href: a.getAttribute("href"),
      }));

      // Buttons sample styles
      const btnSamples = [];
      document.querySelectorAll("button, a[class*='button'], a[class*='btn']").forEach((b) => {
        if (btnSamples.length >= 8) return;
        const s = getComputedStyle(b);
        btnSamples.push({
          text: pick(b),
          bg: s.backgroundColor,
          color: s.color,
          radius: s.borderRadius,
          border: s.border,
          padding: s.padding,
          font: s.fontFamily.slice(0, 60),
          weight: s.fontWeight,
        });
      });

      // Body/global tokens
      const bs = getComputedStyle(document.body);
      const headings = [...document.querySelectorAll("h1,h2,h3")].slice(0, 20).map((h) => {
        const s = getComputedStyle(h);
        return { tag: h.tagName, text: pick(h), size: s.fontSize, weight: s.fontWeight, family: s.fontFamily.slice(0, 50), transform: s.textTransform };
      });

      // Sections overview
      const sections = [...document.querySelectorAll("main > *, section, [class*='section']")]
        .slice(0, 30)
        .map((sec) => ({
          cls: (sec.className || "").toString().slice(0, 80),
          text: pick(sec)?.slice(0, 100),
        }));

      return {
        title: document.title,
        bodyBg: bs.backgroundColor,
        bodyColor: bs.color,
        bodyFont: bs.fontFamily,
        headerText,
        headerHTMLLen,
        navLinks,
        btnSamples,
        headings,
        sections,
      };
    });
    fs.writeFileSync(`${OUT}/structure.json`, JSON.stringify(data, null, 2));
    console.log("TITLE:", data.title);
    console.log("BODY:", data.bodyBg, "|", data.bodyColor, "|", data.bodyFont?.slice(0, 70));
    console.log("HEADER:", data.headerText?.slice(0, 150));
    console.log("NAV:", JSON.stringify(data.navLinks.slice(0, 12), null, 1));
    console.log("BTNS:", JSON.stringify(data.btnSamples.slice(0, 4), null, 1));
    console.log("H1H2:", JSON.stringify(data.headings.slice(0, 10), null, 1));

    // Footer
    const footer = await page.evaluate(() => {
      const f = document.querySelector("footer");
      return f ? { text: f.textContent.replace(/\s+/g, " ").trim().slice(0, 400), bg: getComputedStyle(f).backgroundColor } : null;
    });
    console.log("FOOTER:", JSON.stringify(footer, null, 1));

    // Product listing page if exists
    const plpHref = data.navLinks.find((l) => l.href && /collection|products|shop/i.test(l.href || ""))?.href;
    if (plpHref) {
      const url = new URL(plpHref, "https://shop.x.com").toString();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/x-plp.png`, fullPage: false, timeout: 60000 });
      const plpData = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("[class*='card'], [class*='product-item'], li.grid__item")].slice(0, 6);
        return cards.map((c) => {
          const s = getComputedStyle(c);
          return { cls: (c.className || "").slice(0, 60), bg: s.backgroundColor, radius: s.borderRadius, text: c.textContent.replace(/\s+/g, " ").trim().slice(0, 90) };
        });
      });
      console.log("PLP_URL:", url);
      console.log("PLP_CARDS:", JSON.stringify(plpData, null, 1));
    }
    console.log("\nDONE -> files in", OUT);
  } catch (err) {
    console.error("CRAWL FAIL:", err.message);
  } finally {
    await browser.close();
  }
})();
