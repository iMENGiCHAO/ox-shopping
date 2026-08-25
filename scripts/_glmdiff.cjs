const fs = require("fs");
require("dotenv").config();
const KEY = process.env.ZHIPU_API_KEY;
const API = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
async function ask(prompt, a, bImg) {
  const content = [a, bImg].map((f) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${fs.readFileSync(f).toString("base64")}` } }));
  content.push({ type: "text", text: prompt });
  for (let i = 1; i <= 4; i++) {
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: process.env.ZHIPU_MODEL || "glm-4.6v-flash", messages: [{ role: "user", content }], max_tokens: 1500, temperature: 0.2 }) });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, i * 12000)); continue; }
    const d = await res.json();
    const m = d.choices?.[0]?.message;
    return m?.content || m?.reasoning_content || "(empty)";
  }
  return "(rate-limited)";
}
(async () => {
  const pairs = [
    ["首页", "/tmp/xcom/pg-home.png", "/tmp/local/home.png"],
    ["商品列表", "/tmp/xcom/pg-collection.png", "/tmp/local/collection.png"],
    ["商品详情", "/tmp/xcom/pdp-xai-multi-tumbler.png", "/tmp/local/pdp.png"],
    ["登录", "/tmp/xcom/pg-login.png", "/tmp/local/login.png"],
    ["购物车", "/tmp/xcom/pg-cart.png", "/tmp/local/cart.png"],
  ];
  for (const [name, x, o] of pairs) {
    console.log(`\n########## ${name} ##########`);
    console.log(await ask(`图1是 shop.x.com 官方「${name}」页面真实截图，图2是本地实现的同一页面。不考虑具体商品图片内容差异，请只对比布局与样式。逐项检查：1)头部导航(位置/高度/颜色/元素) 2)页面标题(字号/粗细/位置) 3)主体布局(网格/列数/间距/比例) 4)按钮/表单样式(颜色/尺寸/圆角/边框) 5)页脚。输出：相似度评分(0-10)，然后列出图2与图1的所有可见差异（按严重程度排序，最多8条，每条注明在页面哪个位置）。用中文，简洁。`, x, o));
  }
})();
