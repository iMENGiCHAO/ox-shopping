// 原站取证：判定 PDP 在给定布局宽下是「两栏」还是「单栏」。
//
// 判据：主商品图的浅灰底色 rgb(217,217,217)。
//   两栏 → 主图只占媒体列，灰区右缘 ≈ 媒体列右缘
//   单栏 → 主图占满内容宽，灰区右缘 ≈ 布局宽 − 48
//
// ⚠ 两个已踩过的坑（务必保留注释）：
//  1. thum.io 输出是 **0.5 倍缩放**：图像宽 = 请求宽 ÷ 2，高固定 600（= 视口 1200 的一半）。
//     故「布局 x = 图像 x × 2」。早前记录的「按 宽+16 布局再裁」在这条调用形式上不成立。
//  2. **y 带必须只框住主图**。若把 y 带放到 1240 布局以下，会扫到下方
//     "You may also like" 卡片的灰底（横跨整幅），得出「灰区铺满全宽」的错误结论。
//     主图在布局 y 113..705 ⇒ 图像 y 56..352。
//
// 运行：node scripts/qa/qa-upstream-pdp-cols.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const SLUG = process.env.UP_SLUG || "xai-multi-tumbler";
const LAYOUTS = [766, 866, 966, 1005, 1016, 1024, 1066, 1216];

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1400, height: 900 } }).then((c) => c.newPage());

async function grab(layoutW) {
  const f = `/tmp/up-pdp-${layoutW}.png`;
  if (fs.existsSync(f)) return f; // 已下载则复用，避免重复抓取
  const url = `https://image.thum.io/get/viewportWidth/${layoutW}/noanimate/https://shop.x.com/products/${SLUG}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  return f;
}

async function analyze(file) {
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
    const px = (x, y) => {
      const i = (y * W + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const isGray = (r, gg, b) => Math.abs(r - gg) < 12 && Math.abs(gg - b) < 12 && r > 195 && r < 240;
    const isDark = (r, gg, b) => (r + gg + b) / 3 < 120;

    // 只框主图区域（布局 y 113..705 → 图像 y 56..352），且留出安全余量
    const y0 = 60;
    const y1 = Math.min(350, H - 1);

    const colHas = (pred) => (x) => {
      for (let y = y0; y < y1; y++) {
        const [r, gg, b] = px(x, y);
        if (pred(r, gg, b)) return true;
      }
      return false;
    };
    const grayCol = colHas(isGray);
    const darkCol = colHas(isDark);

    let grayLeft = -1;
    let grayRight = -1;
    for (let x = 0; x < W; x++) if (grayCol(x)) { if (grayLeft < 0) grayLeft = x; grayRight = x; }
    let darkLeft = -1;
    for (let x = 0; x < W; x++) if (darkCol(x)) { darkLeft = x; break; }
    let darkAfterGray = 0;
    if (grayRight > 0) for (let x = grayRight + 6; x < W; x++) if (darkCol(x)) darkAfterGray++;

    return { W, H, y0, y1, grayLeft, grayRight, darkLeft, darkAfterGray };
  }, b64);
}

console.log("图像按 0.5 倍缩放 ⇒ 布局 x = 图像 x × 2；布局宽 = 请求宽\n");
console.log("请求/布局宽 | 图宽 | 主图灰区(图像) | 主图灰区(布局) | 右侧深色列 | 判定");
for (const layoutW of LAYOUTS) {
  const file = await grab(layoutW);
  if (!file) { console.log(`${layoutW} | 抓取失败`); continue; }
  const a = await analyze(file);
  const mediaCol = Math.round(((layoutW - 96 - 80) * 0.7)); // 两栏时媒体列宽
  const twoColRight = 48 + mediaCol;
  const oneColRight = layoutW - 48;
  const d2 = Math.abs(a.grayRight * 2 - twoColRight);
  const d1 = Math.abs(a.grayRight * 2 - oneColRight);
  const verdict = a.darkAfterGray > 20 && d2 < d1 ? "两栏" : d2 < d1 ? "两栏?" : "单栏";
  console.log(
    `${String(layoutW).padStart(6)}      | ${String(a.W).padStart(4)} | ${String(a.grayLeft).padStart(4)}..${String(a.grayRight).padStart(4)} | ${String(a.grayLeft * 2).padStart(5)}..${String(a.grayRight * 2).padStart(5)} | ${String(a.darkAfterGray).padStart(10)} | ${verdict}` +
      `   两栏应≈${twoColRight} / 单栏≈${oneColRight}`,
  );
}

await browser.close();
