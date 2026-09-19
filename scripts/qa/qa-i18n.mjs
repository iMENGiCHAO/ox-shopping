// 英文界面下扫描可见中文（硬编码 i18n 泄漏）
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const routes = [
  "/",
  "/collections",
  "/products",
  "/cart",
  "/search",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/pages/faqs",
  "/pages/accessibility-statement",
  "/policies/privacy",
  "/policies/terms",
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const r of routes) {
  try {
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1500);
    const found = await page.evaluate(() => {
      const out = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        const t = (n.textContent || "").trim();
        if (!t) continue;
        if (/[\u4e00-\u9fff]/.test(t)) {
          const el = n.parentElement;
          // 跳过脚本/样式
          if (el && /SCRIPT|STYLE|NOSCRIPT/.test(el.tagName)) continue;
          out.push(t.slice(0, 60));
        }
      }
      // 属性里的中文（aria-label / placeholder / title / alt）
      const attrs = [];
      for (const el of document.querySelectorAll("[aria-label],[placeholder],[title],[alt]")) {
        for (const a of ["aria-label", "placeholder", "title", "alt"]) {
          const v = el.getAttribute(a);
          if (v && /[\u4e00-\u9fff]/.test(v)) attrs.push(`${a}="${v.slice(0, 40)}"`);
        }
      }
      return { text: [...new Set(out)].slice(0, 6), attrs: [...new Set(attrs)].slice(0, 6) };
    });
    const total = found.text.length + found.attrs.length;
    console.log(`${r.padEnd(38)} ${total === 0 ? "✅ 无中文" : `⚠️ 文本${found.text.length} 属性${found.attrs.length}`}`);
    found.text.forEach((t) => console.log("    文本:", t));
    found.attrs.forEach((a) => console.log("    属性:", a));
  } catch (e) {
    console.log(`${r} FAIL ${String(e).slice(0, 60)}`);
  }
}
await browser.close();
