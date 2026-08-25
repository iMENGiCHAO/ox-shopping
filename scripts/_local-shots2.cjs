const { chromium } = require("@playwright/test");
(async () => {
  const b = await chromium.launch();
  const shots = [
    ["home", "/", 900], ["collection", "/products", 900],
    ["pdp", "/products/xai-multi-tumbler", 900],
    ["cart", "/cart", 900], ["login", "/auth/login", 900],
    ["register", "/auth/register", 900],
  ];
  for (const [n, u, h] of shots) {
    const p = await (await b.newContext({ viewport: { width: 1440, height: h } })).newPage();
    try {
      await p.goto("http://localhost:3000" + u, { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(4000);
      await p.screenshot({ path: `/tmp/local/${n}.png` });
      console.log(n, "ok");
    } catch (e) { console.log(n, "FAIL", e.message.slice(0, 60)); }
    await p.context().close();
  }
  await b.close();
})();
