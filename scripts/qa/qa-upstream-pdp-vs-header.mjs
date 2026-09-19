// 原站取证：用**同一通道**同时测两个信号，抵消 thum.io 的视口偏移。
//
// 为什么要这样：thum.io 的「请求宽」与页面实际参与媒体查询的 CSS 视口宽未必相等
// （可能差一个滚动条宽 / 内部 padding）。单看一个信号无法判断绝对断点。
// 但原站**页头**的断点已有独立实测（≥1000px 才左对齐 Logo，<1000 居中），
// 于是：在同一个请求宽下同时看「页头 Logo 位置」与「PDP 栏数」——
//   · 两者同时翻转 ⇒ PDP 与页头共用 1000px 断点
//   · PDP 先翻转     ⇒ PDP 断点小于 1000
// 这样通道偏移自动抵消。
//
// 信号 A（页头）：页头带（图像 y 8..26）里 Logo 墨迹的横向位置。
//   居中 → 墨迹中心 ≈ W/2；左对齐 → 墨迹中心 ≈ W/12 左右。
// 信号 B（PDP）：x ∈ [0.55W, 0.95W] 的首个深色文字行。
//   两栏 → 信息栏标题在顶部（布局 y ≈ 122）；单栏 → 该带里只有商品照片暗部（布局 y ≈ 272+）。
//
// ⚠ 图像是 0.5 倍缩放（图像宽 = 请求宽 ÷ 2，高固定 600）。
//
// 运行：node scripts/qa/qa-upstream-pdp-vs-header.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const SLUG = process.env.UP_SLUG || "xai-multi-tumbler";
const WIDTHS = [960, 970, 975, 980, 985, 990, 995, 1000, 1005, 1010];

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1400, height: 900 } }).then((c) => c.newPage());

async function grab(w) {
  const f = `/tmp/upvh-${w}.png`;
  if (fs.existsSync(f)) return f;
  const url = `https://image.thum.io/get/viewportWidth/${w}/noanimate/https://shop.x.com/products/${SLUG}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  return f;
}

async function measure(file) {
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

    // 信号 A：页头是**黑底白字**，Logo 是亮色。在 y 8..26 找亮像素的横向范围。
    let aL = -1;
    let aR = -1;
    for (let x = 0; x < W; x++) {
      let hit = false;
      for (let y = 8; y < 26; y++) if (lum(x, y) > 170) { hit = true; break; }
      if (hit) { if (aL < 0) aL = x; aR = x; }
    }

    // 信号 B：右半区首个深色文字行
    const xa = Math.floor(W * 0.55);
    const xb = Math.floor(W * 0.95);
    let bRow = -1;
    for (let y = 45; y < H; y++) {
      let dark = 0;
      for (let x = xa; x < xb; x++) if (lum(x, y) < 130) dark++;
      if (dark >= 3) { bRow = y; break; }
    }
    return { W, aL, aR, aCenter: aL >= 0 ? (aL + aR) / 2 : -1, bRow, bRowLayout: bRow * 2 };
  }, b64);
}

console.log("请求宽 | 图宽 | 页头亮区(图像) | 页头亮区中心 | 居中?(W/2) | 右半首暗行(布局y) | PDP 判定");
let headerFlip = null;
let pdpFlip = null;
let prevHeader = null;
let prevPdp = null;
for (const w of WIDTHS) {
  const f = await grab(w);
  if (!f) { console.log(`${w} | 抓取失败`); continue; }
  const m = await measure(f);
  const headerLeft = m.aCenter < m.W * 0.35; // 中心落在左侧 35% 内 ⇒ Logo 左对齐
  const pdpTwo = m.bRowLayout < 200; // 标题在顶部 ⇒ 两栏
  if (prevHeader !== null && headerLeft !== prevHeader && headerFlip === null) headerFlip = w;
  if (prevPdp !== null && pdpTwo !== prevPdp && pdpFlip === null) pdpFlip = w;
  prevHeader = headerLeft;
  prevPdp = pdpTwo;
  console.log(
    `${String(w).padStart(6)} | ${String(m.W).padStart(4)} | ${String(m.aL).padStart(4)}..${String(m.aR).padStart(4)} | ${String(Math.round(m.aCenter)).padStart(12)} | ${String(Math.round(m.W / 2)).padStart(9)} | ${String(m.bRowLayout).padStart(16)} | ${pdpTwo ? "两栏" : "单栏"}  (页头${headerLeft ? "左对齐" : "居中"})`,
  );
}

console.log(`\n页头翻转于请求宽 ≈ ${headerFlip ?? "(区间内未翻转)"}`);
console.log(`PDP  翻转于请求宽 ≈ ${pdpFlip ?? "(区间内未翻转)"}`);
if (headerFlip && pdpFlip) {
  console.log(
    headerFlip === pdpFlip
      ? `⇒ 两者在**同一请求宽**翻转 ⇒ PDP 与页头共用断点（页头已知 = 1000px）⇒ **PDP 断点 = 1000px**`
      : `⇒ PDP 比页头早翻转 ${headerFlip} < ${headerFlip} ⇒ PDP 断点**小于** 1000px`,
  );
}

await browser.close();
