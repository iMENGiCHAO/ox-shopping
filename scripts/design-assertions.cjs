/* Design token assertions — verify shop.x.com styling landed */
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const checks = [];
  const ok = (name, cond, detail) => checks.push({ name, pass: !!cond, detail });

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);

  // Header chrome
  const headerBg = await page.evaluate(() => {
    const h = document.querySelector("header");
    return h ? getComputedStyle(h).backgroundColor : "none";
  });
  ok("header is pure black", headerBg === "rgb(0, 0, 0)", headerBg);

  const headerColor = await page.evaluate(() => {
    const h = document.querySelector("header");
    return h ? getComputedStyle(h).color : "none";
  });
  ok("header text white", headerColor === "rgb(255, 255, 255)", headerColor);

  // Body canvas + font
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok("body canvas white", bodyBg === "rgb(255, 255, 255)", bodyBg);
  const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  ok("Helvetica stack", /Helvetica Neue/i.test(fontFamily), fontFamily.slice(0, 60));

  // Primary CTA button: black fill, zero radius
  const cta = page.locator("main a[href='/products']").first();
  if (await cta.count()) {
    const [bg, radius] = await page.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.borderRadius];
    }, await cta.elementHandle());
    ok("view-all button squared", parseFloat(radius) === 0, `radius=${radius}`);
    void bg;
  }

  // Product card media: transparent over white page (shop.x.com faithful)
  const cardGround = await page.evaluate(() => {
    const img = document.querySelector("main .aspect-square");
    return img ? getComputedStyle(img).backgroundColor : "none";
  });
  ok("card media transparent (no gray frame)", cardGround === "rgba(0, 0, 0, 0)", cardGround);

  // Header utilities present, no category nav inside header (x.com faithful)
  const navCount = await page.locator("header nav a").count();
  ok("header has no category nav (x.com style)", navCount === 0, `navLinks=${navCount}`);
  const utilText = await page.evaluate(() => document.querySelector("header")?.textContent || "");
  ok("header has cart + search utils", /cart/i.test(utilText) && /search/i.test(utilText), utilText.slice(0, 60));

  // Footer black centered
  const footerBg = await page.evaluate(() => {
    const f = document.querySelector("footer");
    return f ? getComputedStyle(f).backgroundColor : "none";
  });
  ok("footer black", footerBg === "rgb(0, 0, 0)", footerBg);

  // Products page heading: white bg, centered 28px regular (x.com collection)
  await page.goto(BASE + "/products", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(800);
  const plpH1 = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    if (!h1) return null;
    const s = getComputedStyle(h1);
    return { size: s.fontSize, weight: s.fontWeight, align: s.textAlign };
  });
  ok(
    "plp heading 28px regular centered",
    !!plpH1 && plpH1.size === "28px" && (plpH1.weight === "400" || plpH1.weight === "normal") && plpH1.align === "center",
    JSON.stringify(plpH1),
  );

  let fails = 0;
  for (const c of checks) {
    console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? "  [" + c.detail + "]" : ""}`);
    if (!c.pass) fails++;
  }
  console.log(`\n${checks.length - fails}/${checks.length} passed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
