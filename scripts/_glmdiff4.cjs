const fs = require("fs");
require("dotenv").config();
const KEY = process.env.ZHIPU_API_KEY;
const API = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
async function ask(prompt, a, bImg) {
  const content = [a, bImg].map((f) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${fs.readFileSync(f).toString("base64")}` } }));
  content.push({ type: "text", text: prompt });
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: process.env.ZHIPU_MODEL || "glm-4.6v-flash", messages: [{ role: "user", content }], max_tokens: 220, temperature: 0.2 }) });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, i * 15000)); continue; }
    const d = await res.json();
    const m = d.choices?.[0]?.message;
    return (m?.content || m?.reasoning_content || "(empty)").slice(0, 500);
  }
  return "(rate-limited)";
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const pairs = [
    ["首页", "/tmp/xcom/pg-home.png", "/tmp/local/home.png"],
    ["全部商品列表页", "/tmp/xcom/x-all.png", "/tmp/local/collection.png"],
    ["商品详情页", "/tmp/xcom/pdp-xai-multi-tumbler.png", "/tmp/local/pdp.png"],
    ["空购物车页", "/tmp/xcom/x-cart.png", "/tmp/local/cart.png"],
    ["登录页", "/tmp/xcom/pg-login.png", "/tmp/local/login.png"],
  ];
  for (const [name, x, o] of pairs) {
    const out = await ask(`图1 shop.x.com 官方「${name}」截图，图2 克隆站同页面截图。忽略照片内容差异，只比布局/样式/文案结构。严格一行输出：评分X/10；差异：a)…b)…(最多3条，无明显差异就写无)`, x, o);
    console.log(`${name}: ${out}`);
    await sleep(9000);
  }
})();
