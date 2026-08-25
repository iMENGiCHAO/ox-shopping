const { chromium } = require("@playwright/test");
(async () => {
  const b = await chromium.launch();
  const shots = [
    ["home", "/"], ["collection", "/products"], ["pdp", "/products/grok-logo-tee"],
    ["cart", "/cart"], ["login", "/auth/login"], ["register", "/auth/register"], ["search", "/search?q=tee"],
  ];
  for (const [n, u] of shots) {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    try {
      const r = await p.goto("http://localhost:3000" + u, { waitUntil: "networkidle", timeout: 40000 });
      await p.waitForTimeout(1200);
      await p.screenshot({ path: `/tmp/local/${n}.png` });
      console.log(n, r && r.status());
    } catch (e) { console.log(n, "FAIL", e.message.slice(0, 80)); }
    await p.context().close();
  }
  await b.close();
})();
