// shipping 表「启用/编辑」列几何复核：多视口测量开关右缘 → 编辑按钮左缘间距
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle", timeout: 120000 });
await page.getByLabel("邮箱").fill("admin@example.com");
await page.getByLabel("密码").fill("Admin@123456");
await page.getByRole("button", { name: /登录/ }).click();
await page.waitForURL(/\/admin$/, { timeout: 60000 });

let bad = 0;
for (const [w, h] of [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [900, 700],
   [768, 900], [414, 800],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/admin/shipping`, { waitUntil: "networkidle", timeout: 120000 });
  const gaps = await page.evaluate(() => {
    const out = [];
    for (const tr of document.querySelectorAll("tbody tr")) {
      const sw = tr.querySelector("[role='switch']");
      const edit = Array.from(tr.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("编辑"),
      );
      if (!sw || !edit) continue;
      const sr = sw.getBoundingClientRect();
      const er = edit.getBoundingClientRect();
      out.push(Math.round(er.left - sr.right));
    }
    return out;
  });
  const min = Math.min(...gaps);
  const okAll = gaps.every((g) => g >= 8);
  console.log(
    `${okAll ? "PASS" : "FAIL"} @${w}px: rows=${gaps.length} gaps=[${gaps.join(", ")}] min=${min}px`,
  );
  if (!okAll) bad++;
}

await browser.close();
console.log(bad === 0 ? "GEOMETRY OK" : `${bad} VIEWPORTS BAD`);
process.exit(bad === 0 ? 0 : 1);
