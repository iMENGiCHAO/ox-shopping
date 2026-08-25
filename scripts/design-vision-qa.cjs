/* Design QA: screenshot pages -> review via Zhipu GLM vision model */
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = "/tmp/design-qa";
const KEY = process.env.ZHIPU_API_KEY;
const MODEL = process.env.ZHIPU_MODEL || "glm-4.6v-flash";
const API = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

const PAGES = [
  { name: "home-desktop", url: "/", viewport: { width: 1440, height: 900 }, full: true },
  { name: "home-mobile", url: "/", viewport: { width: 390, height: 844 }, full: true },
  { name: "products", url: "/products", viewport: { width: 1440, height: 900 }, full: false },
  { name: "login", url: "/auth/login", viewport: { width: 1440, height: 900 }, full: false },
];

const PROMPT = `你是资深电商视觉设计师。这是按 shop.x.com（SpaceXAI Shop）风格整改后的网店截图：白底黑字、黑色顶栏/页脚、0圆角、Helvetica 常规字重、极简陈列。
请严格走查这张截图，输出：
1) 风格符合度：黑头黑脚/白底/直角/字重是否到位（逐项 是/否）
2) 布局问题：错位、溢出、间距失衡、对比度不足（指出具体位置）
3) 最多 5 条最值得修的问题，按优先级排序，每条一句话。
简洁中文回答，不要客套。`;

async function review(filePath) {
  const b64 = fs.readFileSync(filePath).toString("base64");
  const body = {
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    max_tokens: 900,
    temperature: 0.2,
  };
  let lastErr = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      lastErr = "429";
      await new Promise((r) => setTimeout(r, attempt * 12000));
      continue;
    }
    if (!res.ok) {
      lastErr = `API ${res.status}: ${(await res.text()).slice(0, 200)}`;
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    const text = msg?.content || msg?.reasoning_content || "";
    if (!text) {
      console.error(`[debug] raw: ${JSON.stringify(data).slice(0, 400)}`);
      return "(empty response)";
    }
    return text;
  }
  throw new Error(`giving up after retries (${lastErr})`);
}

(async () => {
  if (!KEY) {
    console.error("ZHIPU_API_KEY missing");
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: p.viewport });
    const page = await ctx.newPage();
    const file = path.join(OUT, `${p.name}.png`);
    try {
      await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      await page.screenshot({ path: file, fullPage: p.full, timeout: 60000 });
      console.log(`\n=== ${p.name} (${p.url}) ===`);
      console.log(await review(file));
    } catch (err) {
      console.error(`FAIL ${p.name}: ${err.message}`);
    } finally {
      await ctx.close();
    }
  }
  await browser.close();
})();
