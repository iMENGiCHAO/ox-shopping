// 基础无障碍扫描：img alt / 可交互元素可访问名 / 表单标签 / h1 / html lang
import { chromium } from "@playwright/test";
const BASE = process.env.QA_BASE || "http://localhost:3000";
const routes = [
  "/",
  "/collections",
  "/products",
  "/products/macrohard-remove-before-flight-keychain",
  "/cart",
  "/search",
  "/auth/login",
  "/pages/faqs",
  "/policies/privacy",
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const r of routes) {
  try {
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1500);
    const res = await page.evaluate(() => {
      const out = { imgNoAlt: [], btnNoName: [], inputNoLabel: [], h1: 0, lang: "" };
      out.lang = document.documentElement.getAttribute("lang") || "(none)";
      out.h1 = document.querySelectorAll("h1").length;
      for (const img of document.querySelectorAll("img")) {
        if (!img.hasAttribute("alt")) out.imgNoAlt.push(img.getAttribute("src")?.slice(0, 60) || "?");
      }
      for (const b of document.querySelectorAll("button")) {
        const name =
          (b.textContent || "").trim() ||
          b.getAttribute("aria-label") ||
          b.getAttribute("title") ||
          "";
        if (!name) out.btnNoName.push((b.className || "").slice(0, 50));
      }
      for (const i of document.querySelectorAll("input, textarea, select")) {
        const id = i.getAttribute("id");
        const labelled =
          (id && document.querySelector(`label[for="${id}"]`)) ||
          i.getAttribute("aria-label") ||
          i.getAttribute("aria-labelledby") ||
          i.closest("label");
        if (!labelled && i.getAttribute("type") !== "hidden")
          out.inputNoLabel.push(i.getAttribute("name") || i.getAttribute("type") || "?");
      }
      return out;
    });
    const issues =
      res.imgNoAlt.length + res.btnNoName.length + res.inputNoLabel.length + (res.h1 > 1 ? 1 : 0);
    console.log(
      `${r.padEnd(48)} lang=${res.lang.padEnd(6)} h1=${res.h1} img无alt=${res.imgNoAlt.length} 按钮无名=${res.btnNoName.length} 表单无标签=${res.inputNoLabel.length} ${issues ? "⚠️" : "✅"}`,
    );
    if (res.imgNoAlt.length) console.log("   img:", res.imgNoAlt.slice(0, 3).join(", "));
    if (res.btnNoName.length) console.log("   btn:", res.btnNoName.slice(0, 3).join(" | "));
    if (res.inputNoLabel.length) console.log("   表单:", res.inputNoLabel.slice(0, 5).join(", "));
  } catch (e) {
    console.log(`${r} FAIL ${String(e).slice(0, 70)}`);
  }
}
await browser.close();
