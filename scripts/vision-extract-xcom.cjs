/* Send crawled screenshots to GLM for pixel-level design extraction */
const fs = require("fs");

const KEY = process.env.ZHIPU_API_KEY;
const API = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

const PROMPTS = {
  "x-home-full.png": `这是 shop.x.com 官方商店的完整首页长截图。请以前端工程师复刻为目的，精确描述从上到下每个区块：
1. 顶部公告条(有无/内容/颜色)
2. 头部导航：布局结构(左右中)、背景色、包含哪些元素和顺序、高度感觉
3. Collection 横幅区：几块、排布方式(左右并排?)、图片内容、文字位置(上下左右?)、按钮样式和文字
4. All Products 区：标题居中?几列网格?卡片构成(图/名称/价格排列方式、对齐方式)
5. 页脚：背景色、内容排列、有哪些链接组
6. 配色与字体气质总结。
用中文，按区块编号输出，具体到颜色和位置，不要泛泛而谈。`,
  "x-plp.png": `这是 shop.x.com 的商品列表页截图。请精确描述：
1. 页面顶部横幅区(颜色/标题/面包屑?)
2. 筛选/排序栏的位置和形式
3. 商品网格几列、商品卡内部结构(图片底色、文字对齐、价格格式)
4. 分页或加载更多的形式。
用中文按编号输出。`,
};

async function review(file, prompt) {
  const b64 = fs.readFileSync(`/tmp/xcom/${file}`).toString("base64");
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: process.env.ZHIPU_MODEL || "glm-4.6v-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
              { type: "text", text: prompt },
            ],
          },
        ],
        max_tokens: 1600,
        temperature: 0.2,
      }),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, attempt * 12000));
      continue;
    }
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    return msg?.content || msg?.reasoning_content || "(empty)";
  }
  throw new Error("429 retries exhausted");
}

(async () => {
  const files = fs.existsSync("/tmp/xcom/x-plp.png")
    ? ["x-home-full.png", "x-plp.png"]
    : ["x-home-full.png"];
  for (const f of files) {
    console.log(`\n########## ${f} ##########`);
    try {
      console.log(await review(f, PROMPTS[f]));
    } catch (e) {
      console.error("FAIL:", e.message);
    }
  }
})();
