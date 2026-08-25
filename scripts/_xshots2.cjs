/* Like-for-like live captures: /collections/all, cart empty, PDP */
const { chromium } = require("@playwright/test");
(async () => {
  const b = await chromium.launch({ proxy: { server: "http://127.0.0.1:10808" } });
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";
  const shots = [
    ["all", "https://shop.x.com/collections/all"],
    ["cart", "https://shop.x.com/cart"],
  ];
  for (const [n, u] of shots) {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, userAgent: ua })).newPage();
    await p.goto(u, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(2000);
    await p.screenshot({ path: `/tmp/xcom/x-${n}.png` });
    console.log(n, "ok");
    await p.context().close();
  }
  await b.close();
})();
