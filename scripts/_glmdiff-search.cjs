const fs = require("fs");
require("dotenv").config();
const KEY = process.env.ZHIPU_API_KEY;
const API = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
async function ask(prompt, a, bImg) {
  const content = [a, bImg].map((f) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${fs.readFileSync(f).toString("base64")}` } }));
  content.push({ type: "text", text: prompt });
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: process.env.ZHIPU_MODEL || "glm-4.6v-flash", messages: [{ role: "user", content }], max_tokens: 700, temperature: 0.2 }) });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, i * 15000)); continue; }
    const d = await res.json();
    const m = d.choices?.[0]?.message;
    return (m?.content || m?.reasoning_content || "(empty)").slice(0, 900);
  }
  return "(rate-limited)";
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const pairs = [
    ["搜索空态页", "/tmp/xsearch/empty.png", "/tmp/local/search-empty.png"],
    ["搜索结果页(tee)", "/tmp/xsearch/q-tee.png", "/tmp/local/search-q-tee.png"],
  ];
  for (const [name, x, o] of pairs) {
    const out = await ask(`图1是 shop.x.com 官方「${name}」截图，图2是我们克隆站的同一页面。只对比布局/样式/文案结构(忽略商品照片内容)。请先输出一行评分"相似度:X/10"，然后列出图2与图1的可见差异(最多5条，注明位置；无明显差异写"无明显差异")。中文简洁回答。`, x, o);
    console.log(`\n##### ${name}\n${out}`);
    await sleep(8000);
  }
})();
