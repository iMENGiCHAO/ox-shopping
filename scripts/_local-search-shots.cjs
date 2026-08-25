const { chromium } = require("@playwright/test");
(async () => {
  const b = await chromium.launch();
  for (const [n, u] of [
    ["empty", "/search"],
    ["q-tee", "/search?q=tee"],
    ["q-noresult", "/search?q=zzzznotexist"],
  ]) {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    try {
      await p.goto("http://localhost:3000" + u, { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(3500);
      await p.screenshot({ path: `/tmp/local/search-${n}.png` });
      console.log(n, "ok");
    } catch (e) { console.log(n, "FAIL", e.message.slice(0, 60)); }
    await p.context().close();
  }
  await b.close();
})();
