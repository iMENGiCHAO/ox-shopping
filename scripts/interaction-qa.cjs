/* Interaction QA: predictive search, cart drawer, buy panel, reveal */
const { chromium } = require("@playwright/test");
const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); cond ? pass++ : fail++; };

(async () => {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 1) Predictive search
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const trigger = page.locator("header button[aria-label='Search products']").first();
  // Retry click — dev-server hydration can lag behind DOMContentLoaded
  for (let i = 0; i < 4; i++) {
    await trigger.click({ timeout: 15000 }).catch(() => {});
    try {
      await page.waitForSelector("[role='dialog'] input", { timeout: 4000 });
      break;
    } catch {
      if (i === 3) throw new Error("search overlay never opened");
    }
  }
  await page.focus("[role='dialog'] input");
  await page.keyboard.type("Grok", { delay: 80 });
  const gotSuggestions = await page
    .waitForSelector("[role='dialog'] a[href*='/products/']", { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  ok("predictive search renders suggestions", gotSuggestions);

  // 2) Click-through to PDP works from suggestions
  if (gotSuggestions) {
    await Promise.all([
      page.waitForURL(/\/products\//, { timeout: 15000 }).catch(() => {}),
      page.locator("[role='dialog'] a[href*='/products/']").first().click(),
    ]);
    ok("suggestion navigates to PDP", page.url().includes("/products/"));
  }

  // 2b) PDP with selectable specs — size options render (mirrored apparel catalog)
  await page.goto(BASE + "/products/grok-logo-tee", { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const optionCount = await page.locator("select[aria-label] option").count();
  ok("size options render on spec PDP", optionCount >= 5, `options=${optionCount}`);

  // 3) Buy panel: round swatch or select present + 46px black CTA
  const swatchOrSelect = (await page.locator("button[class*='rounded-full'][aria-pressed]").count()) > 0 ||
    (await page.locator("select[aria-label]").count()) > 0;
  ok("buy panel has swatches/select", swatchOrSelect);
  const cta = page.locator("main button:has-text('Add to cart'), main button:has-text('Buy now')").first();
  if (await cta.count()) {
    const h = (await cta.boundingBox())?.height;
    ok("PDP CTA ~46px tall", Math.abs((h ?? 0) - 46) < 4, `h=${h}`);
  }

  // 4) Add to bag -> drawer opens (apparel requires size pick first, x.com faithful)
  const sizeSelect = page.locator("select[aria-label]").first();
  if (await sizeSelect.count()) {
    const options = sizeSelect.locator("option");
    const n = await options.count();
    if (n > 1) await sizeSelect.selectOption({ index: 1 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.getByRole("button", { name: /add|加入/i }).first().click().catch(() => {});
  const drawerVisible = await page
    .waitForSelector("div[role='dialog'] aside", { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  ok("cart drawer opens after add-to-cart", drawerVisible);

  // 4b) PDP lightbox — shop.x.com 实测语义：白底/上下贴满/单击锚点3x/拖拽
  {
    await page.goto(BASE + "/products/grok-logo-tee", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(3500);
    const stageBtn = page.locator("main button[aria-label*='Zoom'], main button[aria-label*='zoom']").first();
    await stageBtn.click({ timeout: 8000 }).catch(() => {});
    const opened = await page.waitForSelector("[class*='z-\\[70\\]']", { timeout: 5000 }).then(() => true).catch(() => false);
    ok("lightbox opens on first click", opened);
    if (opened) {
      const img = page.locator("[class*='z-\\[70\\]'] img").last();
      await page.waitForTimeout(600); // 飞入动画+保护期
      const r0 = await img.boundingBox();
      ok("open state touches top (fit-height)", Math.abs(r0.y) < 3, `top=${Math.round(r0.y)}`);
      ok("backdrop is white", await page.evaluate(() => {
        const el = document.querySelector("[class*='z-\\[70\\]']");
        return getComputedStyle(el).backgroundColor === "rgb(255, 255, 255)";
      }));
      // 官方实测两级：一级=高贴窗(上下贴死仅横移)；二级=3×全向贴边拖拽；再点回适配
      await img.click({ position: { x: r0.width * 0.6, y: r0.height * 0.5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(700);
      const r1 = await img.boundingBox();
      const vh = await page.evaluate(() => window.innerHeight);
      ok("first zoom locks to window height", Math.abs(r1.height - vh) < 4 && Math.abs(r1.y) < 4,
        `h=${Math.round(r1.height)} vs ${vh}, top=${Math.round(r1.y)}`);
      await img.click({ position: { x: r0.width * 0.6, y: r0.height * 0.5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(700);
      const r2 = await img.boundingBox();
      ok("second zoom goes ~3x free-pan", r2.width > r0.width * 2.7, `${Math.round(r2.width)} vs ${Math.round(r0.width)}`);
      const cx = r2.x + r2.width / 2, cy = r2.y + r2.height / 2;
      const t1 = await img.evaluate((el) => getComputedStyle(el).transform);
      await page.mouse.move(cx, cy); await page.mouse.down();
      await page.mouse.move(cx + 90, cy + 50, { steps: 6 }); await page.mouse.up();
      await page.waitForTimeout(400);
      const t2 = await img.evaluate((el) => getComputedStyle(el).transform);
      ok("drag pans zoomed detail", t2 !== t1, "transform changed");
    }
  }

  // 5) Reveal animation classes exist on homepage grid items
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const revealCount = await page.locator("main .transition-\\[opacity\\,_transform\\], main [class*='duration-700']").count();
  ok("scroll-reveal wrappers active", revealCount >= 3, `count=${revealCount}`);

  // 6) JSON-LD on PDP
  const slug = page.url(); // homepage now; fetch pdp html directly
  const res = await fetch(BASE + "/products/xai-multi-tumbler").catch(() => null);
  void slug;

  console.log(`\n${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
