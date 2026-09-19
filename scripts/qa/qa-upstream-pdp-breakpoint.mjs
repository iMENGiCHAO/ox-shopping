// 原站取证：二分定位 PDP 的「两栏」切换点。
//
// 判据（比灰区检测可靠得多）：**商品标题的纵向位置**。
//   两栏 → 标题在信息栏顶部（布局 y ≈ 113 起）
//   单栏 → 标题在主图下方（布局 y ≈ 1000 起）
// 实现：在 x ∈ [0.55W, 0.95W] 找最上方的深色文字行。
//
// ⚠ 图像是 **0.5 倍缩放**（图像宽 = 请求宽 ÷ 2，高固定 600 = 视口 1200 的一半），
// 布局 x/y = 图像 x/y × 2。早前记录的「按 宽+16 布局再裁」在这条调用形式上不成立 ——
// 那个 +16 是另一条 thum.io 调用形式（带 /width/ 参数）的伪影。
//
// 运行：node scripts/qa/qa-upstream-pdp-breakpoint.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const SLUG = process.env.UP_SLUG || "xai-multi-tumbler";

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1400, height: 900 } }).then((c) => c.newPage());

async function grab(layoutW) {
  const f = `/tmp/upbp-${layoutW}.png`;
  if (fs.existsSync(f)) return f;
  const url = `https://image.thum.io/get/viewportWidth/${layoutW}/noanimate/https://shop.x.com/products/${SLUG}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  return f;
}

async function classify(file) {
  const b64 = fs.readFileSync(file).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    const W = c.width;
    const H = c.height;
    const lum = (x, y) => {
      const i = (y * W + x) * 4;
      return (data[i] + data[i + 1] + data[i + 2]) / 3;
    };
    // 跳过页头（图像 y < 40 是黑色顶栏）
    const yTop = 45;
    const xa = Math.floor(W * 0.55);
    const xb = Math.floor(W * 0.95);
    let titleRow = -1;
    for (let y = yTop; y < H; y++) {
      let dark = 0;
      for (let x = xa; x < xb; x++) if (lum(x, y) < 130) dark++;
      if (dark >= 3) { titleRow = y; break; }
    }
    return { W, H, titleRow, titleRowLayout: titleRow * 2, ratio: titleRow / H };
  }, b64);
}

// 先用两个已知样本校验判据
console.log("── 判据校验（已知样本）──");
for (const [layoutW, expect] of [[950, "单栏"], [989, "两栏"], [1200, "两栏"]]) {
  const f = `/tmp/up-pdp-${layoutW === 950 ? 966 : layoutW === 989 ? 1005 : 1216}.png`;
  if (!fs.existsSync(f)) { console.log(`  ${layoutW}: 缺样本文件 ${f}`); continue; }
  const a = await classify(f);
  const verdict = a.titleRowLayout < 300 ? "两栏" : "单栏";
  console.log(`  布局 ${layoutW}: 标题行(布局 y)=${a.titleRowLayout} → ${verdict}  期望=${expect} ${verdict === expect ? "✅" : "❌"}`);
}

console.log("\n── 二分定位切换点 ──");
const results = [];
for (const layoutW of [955, 960, 970, 980, 985, 990, 995, 1000, 1005, 1010, 1015, 1020, 1024]) {
  const f = await grab(layoutW);
  if (!f) { console.log(`  ${layoutW}: 抓取失败`); continue; }
  const a = await classify(f);
  const verdict = a.titleRowLayout < 300 ? "两栏" : "单栏";
  results.push([layoutW, verdict]);
  console.log(`  布局 ${String(layoutW).padStart(4)}: 标题行(布局 y)=${String(a.titleRowLayout).padStart(4)} → ${verdict}`);
}

const two = results.filter((r) => r[1] === "两栏").map((r) => r[0]);
const one = results.filter((r) => r[1] === "单栏").map((r) => r[0]);
if (two.length && one.length) {
  console.log(`\n单栏最大 = ${Math.max(...one)}   两栏最小 = ${Math.min(...two)}`);
  console.log(`⇒ 切换点落在 (${Math.max(...one)}, ${Math.min(...two)}]`);
}

await browser.close();
