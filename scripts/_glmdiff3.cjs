const fs = require("fs");
require("dotenv").config();
const KEY = process.env.ZHIPU_API_KEY;
const API = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
async function ask(prompt, a, bImg) {
  const content = [a, bImg].map((f) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${fs.readFileSync(f).toString("base64")}` } }));
  content.push({ type: "text", text: prompt });
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: process.env.ZHIPU_MODEL || "glm-4.6v-flash", messages: [{ role: "user", content }], max_tokens: 500, temperature: 0.2 }) });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, i * 15000)); continue; }
    const d = await res.json();
    const m = d.choices?.[0]?.message;
    return (m?.content || m?.reasoning_content || "(empty)").slice(0, 800);
  }
  return "(rate-limited)";
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const pairs = [
    ["全部商品页", "/tmp/xcom/x-all.png", "/tmp/local/home.png"].slice(0,0).concat([["首页", "/tmp/xcom/pg-home.png", "/tmp/local/home.png"]])[0],
    ["全部商品列表", "/tmp/xcom/x-all.png", "/tmp/local/collection.png"],
    ["商品详情", "/tmp/xcom/pdp-xai-multi-tumbler.png", "/tmp/local/pdp.png"],
    ["空购物车", "/tmp/xcom/x-cart.png", "/tmp/local/cart.png"],
  ];
  for (const [name, x, o] of pairs) {
    let out = await ask(`图1 shop.x.com 官方「${name}」，图2 我们的克隆。只比布局/样式/文案结构(忽略照片)。一行输出：评分X/10；差异：a)…b)…(最多3条,无则写无明显差异)`, x, o);
    console.log(`\n##### ${name}\n${out}`);
    await sleep(8000);
  }
})();
