/* Side-by-side comparison: ours vs shop.x.com, reviewed by GLM vision */
const { chromium } = require("@playwright/test");
const fs = require("fs");

const BASE = "http://localhost:3000";
const KEY = process.env.ZHIPU_API_KEY;
const API = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

async function shoot(browser, url, out) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: out, timeout: 60000 });
  await ctx.close();
}

async function ask(prompt, images) {
  const content = images.map((f) => ({
    type: "image_url",
    image_url: { url: `data:image/png;base64,${fs.readFileSync(f).toString("base64")}` },
  }));
  content.push({ type: "text", text: prompt });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: process.env.ZHIPU_MODEL || "glm-4.6v-flash",
        messages: [{ role: "user", content }],
        max_tokens: 1200,
        temperature: 0.2,
      }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, attempt * 12000));
      continue;
    }
    if (!res.ok) throw new Error(`API ${res.status}`);
    const d = await res.json();
    const m = d.choices?.[0]?.message;
    return m?.content || m?.reasoning_content || "(empty)";
  }
  return "(rate-limited)";
}

(async () => {
  const browser = await chromium.launch();

  console.log("capturing ours…");
  await shoot(browser, BASE + "/", "/tmp/xcom/our-home.png");

  console.log("comparing home…");
  const verdict = await ask(
    `图1是 shop.x.com 官方首页首屏，图2是我们仿制的首页首屏。请逐项对比并打分(0-10)：\n1. 头部导航布局(居中logo/右侧工具/黑底)\n2. Collection横幅区(对半排布/[名称]位置/Shop All位置)\n3. All Products标题与网格\n4. 整体黑白极简气质。\n最后列出我们与原站最明显的3个差异，按重要性排序。中文回答。`,
    ["/tmp/xcom/x-home-viewport.png", "/tmp/xcom/our-home.png"],
  );
  console.log("\n===== COMPARISON =====\n" + verdict);

  await browser.close();
})();
