/* Fetch x.com imagery via in-page browser fetch -> base64 -> local files */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "public", "images", "xcom");
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  // Establish same-origin context
  await page.goto("https://shop.x.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);

  async function save(url, file) {
    const b64 = await page.evaluate(async (u) => {
      try {
        const r = await fetch(u, { credentials: "include" });
        if (!r.ok) return null;
        const buf = await r.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buf);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
      } catch {
        return null;
      }
    }, url);
    if (!b64) {
      console.log(`FAIL ${file}`);
      return false;
    }
    fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(b64, "base64"));
    console.log(`OK ${file} (${Math.round(b64.length * 0.75 / 1024)}KB)`);
    return true;
  }

  let count = 0;

  // Banners
  if (await save("https://shop.x.com/cdn/shop/files/X_Model_v4.jpg?width=1920", "banner-x.jpg")) count++;
  if (await save("https://shop.x.com/cdn/shop/files/xAI_Model.png?width=1920", "banner-xai.jpg")) count++;

  // Product shots
  const pdpImages = JSON.parse(fs.readFileSync("/tmp/xcom/pdp-images.json", "utf8"));
  for (const [handle, urls] of Object.entries(pdpImages)) {
    const picks = [...new Set(urls.filter((u) => !u.includes("symbol")))].slice(0, 2);
    for (let i = 0; i < picks.length; i++) {
      const u = new URL(picks[i]);
      u.searchParams.set("width", "1200");
      if (await save(u.toString(), `p-${handle}-${i}.jpg`)) count++;
    }
  }

  console.log(`\nSaved ${count} files -> ${OUT_DIR}`);
  await browser.close();
})();
