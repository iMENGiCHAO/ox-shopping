const { chromium } = require("@playwright/test");
const fs = require("fs");

const BASE = "https://shop.x.com";
const OUT = "/tmp/xcom-audit";
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { key: "home", url: `${BASE}/` },
  { key: "collection-all", url: `${BASE}/products` },
  { key: "pdp", url: `${BASE}/products/xai-multi-tumbler` },
  { key: "cart", url: `${BASE}/cart` },
  { key: "search", url: `${BASE}/search?q=tumbler` },
  { key: "login", url: `${BASE}/account/login` },
  { key: "register", url: `${BASE}/account/register` },
  { key: "notfound", url: `${BASE}/pages/nonexistent-page-xyz` },
];

async function audit(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
    // 标题层级
    const headings = ["h1", "h2", "h3", "h4"]
      .flatMap((tag) => [...document.querySelectorAll(tag)])
      .filter(vis)
      .map((h) => ({
        tag: h.tagName.toLowerCase(),
        text: txt(h).slice(0, 60),
        size: getComputedStyle(h).fontSize,
        weight: getComputedStyle(h).fontWeight,
      }));
    // 页脚链接
    const footerLinks = [
      ...document.querySelectorAll("footer a, [class*=footer] a"),
    ]
      .filter(vis)
      .map((a) => ({ text: txt(a).slice(0, 40), href: a.getAttribute("href")?.slice(0, 60) }));
    // 区块骨架：main 下主要 section 的类名与高度
    const sections = [...document.querySelectorAll("main > *, main section, shopify-section > *")]
      .filter(vis)
      .slice(0, 25)
      .map((s) => ({
        cls: String(s.className).slice(0, 70),
        h: Math.round(s.getBoundingClientRect().height),
        firstText: txt(s).slice(0, 40),
      }));
    // 按钮
    const buttons = [...document.querySelectorAll("button, [role=button], a[class*=btn], input[type=submit]")]
      .filter(vis)
      .slice(0, 30)
      .map((b) => ({ text: txt(b).slice(0, 40), cls: String(b.className).slice(0, 50) }));
    // 详情页手风琴 details/summary
    const accordions = [...document.querySelectorAll("details summary, [class*=accordion] summary, .summary")]
      .filter(vis)
      .map((s) => txt(s).slice(0, 50));
    // 全站导航
    const navLinks = [...document.querySelectorAll("header a, nav a")]
      .filter(vis)
      .map((a) => ({ text: txt(a).slice(0, 30), href: a.getAttribute("href") }));
    return { title: document.title, headings, footerLinks, sections, buttons, accordions, navLinks };
  });
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  for (const pg of PAGES) {
    try {
      await p.goto(pg.url, { waitUntil: "networkidle", timeout: 60000 });
    } catch {}
    await p.waitForTimeout(3500);
    const data = await audit(p);
    fs.writeFileSync(`${OUT}/${pg.key}.json`, JSON.stringify(data, null, 1));
    await p.screenshot({ path: `${OUT}/${pg.key}.png`, timeout: 8000 }).catch(() => console.log(`  (shot skipped ${pg.key})`));
    console.log(`✓ ${pg.key}  h:${data.headings.length} sec:${data.sections.length} btn:${data.buttons.length}`);
  }
  await b.close();
})();
