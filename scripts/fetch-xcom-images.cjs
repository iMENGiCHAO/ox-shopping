/* Download shop.x.com imagery into public/images/xcom as local demo assets */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "public", "images", "xcom");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Banner sources from crawl
const BANNERS = [
  { url: "https://shop.x.com/cdn/shop/files/X_Model_v4.jpg?v=1763698583&width=1920", file: "banner-x.jpg" },
  { url: "https://shop.x.com/cdn/shop/files/xAI_Model.png?v=1763696117&width=1920", file: "banner-xai.jpg" },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  });
  const page = await ctx.newPage();

  const saved = [];

  async function save(url, file) {
    if (saved.includes(file)) return;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await ctx.request.get(url, { timeout: 45000 });
        if (!resp.ok()) {
          console.log(`SKIP ${file} (${resp.status()})`);
          return;
        }
        const buf = await resp.body();
        fs.writeFileSync(path.join(OUT_DIR, file), buf);
        saved.push(file);
        console.log(`OK ${file} (${Math.round(buf.length / 1024)}KB)`);
        return;
      } catch (err) {
        console.log(`retry ${attempt} ${file}: ${err.message.slice(0, 50)}`);
        await new Promise((r) => setTimeout(r, attempt * 4000));
      }
    }
    console.log(`FAIL ${file}`);
  }

  // Banners
  for (const b of BANNERS) await save(b.url, b.file);

  // Collect product image URLs by visiting PDPs and reading JSON-LD / og:image + first card imgs
  const handlesFile = "/tmp/xcom/pdp-images.json";
  const pdpImages = fs.existsSync(handlesFile) ? JSON.parse(fs.readFileSync(handlesFile, "utf8")) : {};
  let idx = 0;
  for (const [handle, urls] of Object.entries(pdpImages)) {
    // take up to 2 unique product shots per handle (skip logo png)
    const picks = [...new Set(urls.filter((u) => !u.includes("symbol")))].slice(0, 2);
    for (let i = 0; i < picks.length; i++) {
      const u = new URL(picks[i]);
      u.searchParams.set("width", "1200");
      idx += 1;
      await save(u.toString(), `p-${handle}-${i}.jpg`);
    }
  }
  console.log(`\nTotal saved: ${saved.length} files -> ${OUT_DIR}`);
  await browser.close();
})();
