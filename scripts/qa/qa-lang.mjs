// 币种→语言联动细测：区分「软导航后」与「硬刷新后」的语言状态
import { chromium } from "@playwright/test";
const BASE = process.env.QA_BASE || "http://localhost:3000";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function pick(labelRe) {
  await page.getByRole("button", { name: /(EUR|CNY|USD)\s*[€¥$]/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("option", { name: labelRe }).first().click();
  await page.waitForTimeout(4500);
}
async function probe(tag) {
  const r = await page.evaluate(() => {
    const txt = document.body.innerText;
    return {
      zh: /全部商品|购物车|登录/.test(txt),
      en: /All Products/.test(txt),
      url: location.pathname,
      cur: (document.cookie.match(/currency=([^;]+)/) || [])[1] || "(none)",
      lang: (document.cookie.match(/shop-lang=([^;]+)/) || [])[1] || "(none)",
      price: (txt.match(/[€¥$]\s?[\d.,]+/) || ["(none)"])[0],
    };
  });
  console.log(`${tag.padEnd(22)} url=${r.url.padEnd(5)} currency=${r.cur.padEnd(5)} shop-lang=${r.lang.padEnd(5)} 中文=${r.zh} 英文=${r.en} 首个价格=${r.price}`);
}
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2500);
await probe("初始");
await pick(/China \(CNY/);
await probe("切 CNY (软导航)");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await probe("切 CNY 后硬刷新");
await pick(/United States \(USD/);
await probe("切 USD (软导航)");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await probe("切 USD 后硬刷新");
await browser.close();
