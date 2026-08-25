/* Design QA screenshots via project-local Playwright */
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = "/tmp/design-qa";

const PAGES = [
  { name: "home", url: "/", viewport: { width: 1440, height: 900 }, full: true },
  { name: "home-mobile", url: "/", viewport: { width: 390, height: 844 }, full: true },
  { name: "products", url: "/products", viewport: { width: 1440, height: 900 }, full: false },
  { name: "login", url: "/auth/login", viewport: { width: 1440, height: 900 }, full: false },
];

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: p.viewport });
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + p.url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: p.full });
      console.log(`OK ${p.name} -> ${OUT}/${p.name}.png`);
    } catch (err) {
      console.error(`FAIL ${p.name}: ${err.message}`);
    } finally {
      await ctx.close();
    }
  }
  await browser.close();
})();
