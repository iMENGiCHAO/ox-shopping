/**
 * 从原站抓取商品图片并本地化（大爷需求：用原站商品图，「下载到本地」不用外链）。
 *
 * 为什么用浏览器：本机 curl/node fetch 到 shop.x.com 被 TLS reset（墙），
 * 而 Chromium 走系统 VPN → 200（实测 title「Official SpaceXAI Shop」）。
 * 图片 CDN（cdn.shopify.com）本身可达，但用浏览器上下文请求最稳（带 UA/cookie）。
 *
 * 流程：
 *   1. 浏览器内 fetch /products.json → 商品 + 图片 URL（缓存在 .shop-scrape/catalog.json）
 *   2. 按「品类关键词」把原站商品池映射到本地演示商品（tee/hoodie/hat/tumbler…）
 *   3. 逐图下载（ctx.request.get）→ sharp 压缩为 WebP（最长边 1600, q82）
 *   4. 落盘 public/images/products/<slug>/<n>.webp + 更新 Product.images
 *
 * 用法：node scripts/fetch-shop-images.mjs [--dry]
 * 合规：图片版权归原站，仅内测看效果；商业发布前替换自有素材。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const dry = process.argv.includes("--dry");
const CATALOG = ".shop-scrape/catalog.json";
const OUT_BASE = resolve("public/images/products");
const prisma = new PrismaClient();

/** 品类关键词（原站标题 → 归类；顺序敏感：先匹配更具体的） */
const CATEGORY_RULES = [
  ["beanie", /beanie|knit cap/i],
  ["tumbler", /tumbler|bottle|vessel|mug|cup/i],
  ["sock", /sock/i],
  ["hoodie", /hoodie|crewneck|sweatshirt/i],
  ["shirt", /jersey|rugby|shirt(?!\s*set)/i],
  ["hat", /hat|cap/i],
  ["tee", /tee|t-shirt|t shirt/i],
];

function categorize(text) {
  for (const [name, re] of CATEGORY_RULES) if (re.test(text)) return name;
  return "other";
}

/** 本地演示商品 slug → 品类（与上面同一套关键词，保证同池匹配） */
function slugCategory(slug) {
  return categorize(slug.replace(/^ox-/, "").replace(/-/g, " "));
}

async function main() {
  // ── 1. 商品目录（有缓存则复用，避免重复抓）──
  let catalog;
  if (existsSync(CATALOG)) {
    catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
    console.log(`复用缓存目录：${catalog.length} 个商品`);
  } else {
    const b = await chromium.launch();
    const p = await (await b.newContext()).newPage();
    await p.goto("https://shop.x.com/", { timeout: 30000, waitUntil: "domcontentloaded" });
    const raw = await p.evaluate(async () => (await fetch("/products.json?limit=250")).json());
    catalog = (raw.products ?? []).map((x) => ({
      title: x.title,
      handle: x.handle,
      images: (x.images ?? []).map((i) => i.src),
    }));
    mkdirSync(".shop-scrape", { recursive: true });
    writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
    await b.close();
    console.log(`抓取目录：${catalog.length} 个商品`);
  }

  // ── 2. 原站按品类建池 ──
  const pool = new Map();
  for (const item of catalog) {
    const cat = categorize(item.title);
    if (item.images.length === 0) continue;
    const list = pool.get(cat) ?? [];
    list.push(item);
    pool.set(cat, list);
  }
  console.log("原站品类池:", [...pool.entries()].map(([k, v]) => `${k}:${v.length}`).join(" · "));

  // ── 3. 本地商品 → 分配原站商品（同品类轮转，超出循环复用）──
  const products = await prisma.product.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });
  const cursor = new Map();
  const assignments = [];
  for (const prod of products) {
    const cat = slugCategory(prod.slug);
    const candidates = pool.get(cat) ?? pool.get("other") ?? [];
    if (candidates.length === 0) continue;
    const i = (cursor.get(cat) ?? 0) % candidates.length;
    cursor.set(cat, i + 1);
    assignments.push({ product: prod, source: candidates[i], category: cat });
  }
  console.log(`待更新商品：${assignments.length}/${products.length}`);

  // ── 4. 下载 + 压缩 + 入库 ──
  const b = await chromium.launch();
  const ctx = await b.newContext();
  let done = 0;
  for (const { product, source, category } of assignments) {
    const dir = join(OUT_BASE, product.slug);
    const rel = [];
    for (const [idx, url] of source.images.slice(0, 6).entries()) {
      try {
        const resp = await ctx.request.get(url, { timeout: 30000 });
        if (!resp.ok()) continue;
        const buf = await resp.body();
        const outRel = `/images/products/${product.slug}/${idx + 1}.webp`;
        rel.push(outRel);
        if (!dry) {
          mkdirSync(dir, { recursive: true });
          await sharp(buf)
            .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(join(dir, `${idx + 1}.webp`));
        }
      } catch {
        /* 单图失败跳过，不中断整批 */
      }
    }
    if (!dry && rel.length > 0) {
      await prisma.product.update({ where: { id: product.id }, data: { images: rel } });
    }
    done++;
    console.log(`✓ ${product.slug} [${category}] ← ${source.title}（${rel.length} 张）`);
  }
  await b.close();
  await prisma.$disconnect();
  console.log(`\n完成：${dry ? "[dry-run] " : ""}更新 ${done} 个商品`);
  console.log("⚠️ 版权提醒：图片归原站所有，仅内测；商业发布前必须替换自有素材。");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
