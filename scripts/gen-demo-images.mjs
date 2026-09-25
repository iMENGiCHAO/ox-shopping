/**
 * 生成中性演示商品图（scripts/gen-demo-images.mjs）
 *
 * 为什么存在：演示目录必须是**无任何第三方商标**的自有资产。
 * 此前 public/images/xcom2/ 是上游电商站的真实商品照片（87MB，120 张），
 * 商业交付构成知识产权风险 —— 本脚本用 sharp 生成统一「Ox Essentials」
 * 品牌方格风格的演示图，替代所有镜像图。
 *
 * 运行：node scripts/gen-demo-images.mjs   （写入 public/images/demo/）
 * 幂等：重复运行直接覆盖同名文件。
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "public/images/demo");

/** 30 个中性演示商品：slug + 展示名 + 图片张数（与 demo-catalog.ts 一致） */
const PRODUCTS = [
  ["ox-rugby-shirt", "Ox Rugby Shirt", 4],
  ["ox-oversized-jersey", "Ox Oversized Jersey", 3],
  ["ox-remove-before-flight-keychain", "Ox Remove Before Flight Keychain", 5],
  ["ox-kids-constellation-hoodie", "Ox Kids Constellation Hoodie", 3],
  ["ox-kids-constellation-tee", "Ox Kids Constellation Tee", 3],
  ["ox-multi-tumbler", "Ox Multi Tumbler", 6],
  ["ox-thermal-beanie", "Ox Thermal Beanie", 2],
  ["ox-hydration-vessel", "Ox Hydration Vessel", 4],
  ["ox-reflective-tee", "Ox Reflective Tee", 3],
  ["ox-everything-mug", "Ox Everything Mug", 8],
  ["ox-midnight-graphic-tee", "Ox Midnight Graphic Tee", 3],
  ["ox-human-connection-tee", "Ox Human Connection Tee", 3],
  ["ox-signature-crew-sock-set", "Ox Signature Crew Sock Set", 4],
  ["ox-ribbed-beanie", "Ox Ribbed Beanie", 2],
  ["ox-core-crewneck", "Ox Core Crewneck", 4],
  ["ox-trucker-hat", "Ox Trucker Hat", 4],
  ["ox-classic-trucker-hat", "Ox Classic Trucker Hat", 4],
  ["ox-dad-hat", "Ox Dad Hat", 4],
  ["ox-classic-dad-hat", "Ox Classic Dad Hat", 5],
  ["ox-hoodie", "Ox Hoodie", 3],
  ["ox-classic-hoodie", "Ox Classic Hoodie", 3],
  ["ox-logo-tee", "Ox Logo Tee", 3],
  ["ox-constellation-tee", "Ox Constellation Tee", 4],
  ["ox-graphic-logo-tee", "Ox Graphic Logo Tee", 3],
  ["ox-core-hoodie", "Ox Core Hoodie", 7],
  ["ox-retro-crewneck-presale", "Ox Retro Crewneck", 4],
  ["ox-retro-tee-presale", "Ox Retro Tee", 4],
  ["ox-core-dad-hat", "Ox Core Dad Hat", 6],
  ["ox-core-trucker-hat", "Ox Core Trucker Hat", 4],
  ["ox-core-tee", "Ox Core Tee", 2],
];

const SIZE = 1024;

/** 每商品固定色相（i 均匀铺满色环），第 k 张亮度依次递变 */
function bgFor(index, k) {
  const hue = Math.round((index * 360) / PRODUCTS.length + 15) % 360;
  const light = 88 - k * 6; // 88% → 逐步压暗
  return `hsl(${hue}, 34%, ${light}%)`;
}

function svgTile(name, index, k) {
  const bg = bgFor(index, k);
  const fg = "hsl(0, 0%, 24%)";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${bg}"/>
  <rect x="56" y="56" width="${SIZE - 112}" height="${SIZE - 112}" fill="none" stroke="${fg}" stroke-opacity="0.18" stroke-width="2"/>
  <text x="50%" y="47%" text-anchor="middle" dominant-baseline="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="300" font-weight="700" fill="${fg}" fill-opacity="0.92">OX</text>
  <text x="50%" y="72%" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="500" fill="${fg}" fill-opacity="0.8">${name}</text>
  <text x="50%" y="81%" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="30" letter-spacing="10" fill="${fg}" fill-opacity="0.5">OX ESSENTIALS</text>
</svg>`;
}

function svgBanner(label) {
  const W = 2048;
  const H = 640;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="hsl(215, 30%, 88%)"/>
      <stop offset="1" stop-color="hsl(280, 26%, 82%)"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <text x="50%" y="46%" text-anchor="middle" dominant-baseline="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="150" font-weight="700" fill="hsl(0, 0%, 24%)">OX</text>
  <text x="50%" y="64%" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="54" letter-spacing="14" fill="hsl(0, 0%, 40%)">${label}</text>
</svg>`;
}

async function render(svg, out) {
  await sharp(Buffer.from(svg)).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let n = 0;
  for (let i = 0; i < PRODUCTS.length; i++) {
    const [slug, name, count] = PRODUCTS[i];
    for (let k = 0; k < count; k++) {
      await render(svgTile(name, i, k), path.join(OUT_DIR, `${slug}-${k}.jpg`));
      n++;
    }
  }
  await render(svgBanner("OX ESSENTIALS COLLECTION"), path.join(OUT_DIR, "banner-ox-essentials.jpg"));
  await render(svgBanner("OX COLLECTION"), path.join(OUT_DIR, "banner-ox.jpg"));
  n += 2;
  console.log(`✓ 生成 ${n} 张演示图 → public/images/demo/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
