// 定点探针：Logo 图片的**可见墨迹包围盒**（判断图内透明留白是否导致视觉偏心）。
// 只测量、不断言，永远 exit 0。
//
// 起因：375 视口下 `.header-logo` 元素精确居中（cx=187.5=视口中线），
// 但原站截图实测「左缘 153px」，差 1.5px。若本地 Logo PNG 左侧有透明留白，
// 可见墨迹就会整体右移，那是**真实的视觉偏心**；若没有，则 1.5px 属于
// 截图测量的阈值误差，不该去"修"。
//
// 运行：node scripts/qa/qa-probe-logo-ink.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE || "http://localhost:3000";

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 375, height: 812 } }).then((c) => c.newPage());
page.setDefaultTimeout(180_000);
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const out = await page.evaluate(async () => {
  const img = document.querySelector(".header-logo img");
  if (!img) return { found: false };
  const r = img.getBoundingClientRect();

  // 用 canvas 扫描 alpha > 16 的墨迹包围盒
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const { data } = g.getImageData(0, 0, c.width, c.height);

  let minX = c.width, maxX = -1, minY = c.height, maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const scale = r.width / c.width; // 元素宽 / 自然宽
  return {
    found: true,
    src: img.currentSrc || img.src,
    natural: `${c.width}×${c.height}`,
    elementBox: { left: Math.round(r.left * 10) / 10, w: Math.round(r.width * 10) / 10, cx: Math.round((r.left + r.width / 2) * 10) / 10 },
    inkBoxNatural: maxX < 0 ? null : { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 },
    // 墨迹换算到 CSS 像素后的位置
    inkBoxCss: maxX < 0 ? null : {
      leftPad: Math.round(minX * scale * 10) / 10,
      rightPad: Math.round((c.width - 1 - maxX) * scale * 10) / 10,
      w: Math.round((maxX - minX + 1) * scale * 10) / 10,
    },
    viewportCenter: window.innerWidth / 2,
  };
});

console.log("── Logo 墨迹包围盒 ──");
console.log(JSON.stringify(out, null, 2));
if (out.inkBoxCss && out.elementBox) {
  const inkLeft = out.elementBox.left + out.inkBoxCss.leftPad;
  const inkCx = inkLeft + out.inkBoxCss.w / 2;
  console.log(`\n  墨迹左缘(CSS) = ${Math.round(inkLeft * 10) / 10}`);
  console.log(`  墨迹中心(CSS) = ${Math.round(inkCx * 10) / 10}   视口中线 = ${out.viewportCenter}`);
  console.log(`  墨迹相对视口中线偏移 = ${Math.round((inkCx - out.viewportCenter) * 10) / 10}px`);
}

await browser.close();
