/**
 * 抓取原站首页 hero 横幅并换到本地（大爷要求「把横栏图也加上去」）。
 *
 * 原站首页轮播 hero（Shopify /cdn/shop/files/ 自有素材，实测 16:9）：
 *   X_Model_v4.jpg (1440x807) · xAI_Model.png (720x403)
 *
 * 行为：浏览器下载（走系统 VPN 过墙）→ sharp 压缩（宽 2400, jpeg q88）
 *      → 落盘 public/images/demo/banner-shop-<n>.jpg
 *      → 更新全部分类的 image / bannerImage / cardImage 轮换指向
 *
 * 用法：node scripts/fetch-shop-banners.mjs [--dry]
 * 合规：图片版权归原站，仅内测；发布前替换自有素材。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const dry = process.argv.includes("--dry");
const prisma = new PrismaClient();
const OUT_DIR = resolve("public/images/demo");

/** 原站首页 hero（探测所得，按显示顺序） */
const HEROES = [
  "https://shop.x.com/cdn/shop/files/X_Model_v4.jpg?v=1763698583&width=2000",
  "https://shop.x.com/cdn/shop/files/xAI_Model.png?v=1763698583&width=2000",
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

  // ⚠️ hero 图在**店铺域名**（shop.x.com/cdn/...）上，被墙；Playwright 的
  // ctx.request 不走浏览器网络栈（ECONNRESET）。必须在**页面上下文内 fetch**
  // （走 Chromium 网络栈 → 系统 VPN → 200），再把字节以 base64 带回 Node。
  await ctx.newPage().then((pg) => pg.goto("https://shop.x.com/", { timeout: 40000, waitUntil: "domcontentloaded" }));

  const saved = [];
  for (const [i, url] of HEROES.entries()) {
    let buf;
    try {
      const b64 = await ctx.pages()[0].evaluate(async (u) => {
        const r = await fetch(u);
        if (!r.ok) return "";
        const bytes = new Uint8Array(await r.arrayBuffer());
        let s = "";
        for (let j = 0; j < bytes.length; j++) s += String.fromCharCode(bytes[j]);
        return btoa(s);
      }, url);
      if (!b64) {
        console.log(`✗ 下载失败（页面内 fetch 返回空）${url}`);
        continue;
      }
      buf = Buffer.from(b64, "base64");
    } catch (e) {
      console.log(`✗ 下载异常 ${url}: ${String(e.message).split("\n")[0]}`);
      continue;
    }
    const rel = `/images/demo/banner-shop-${i + 1}.jpg`;
    if (!dry) {
      await sharp(buf)
        .resize({ width: 2400, withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toFile(resolve(`public${rel}`));
    }
    saved.push(rel);
    console.log(`✓ hero ${i + 1} ← ${url.split("/").pop()?.split("?")[0]} → ${rel}`);
  }
  await b.close();

  if (saved.length === 0) {
    console.log("没有成功下载任何 hero，未改动数据库。");
    await prisma.$disconnect();
    return;
  }

  // 分类横幅轮换指向抓到的 hero（首页轮播 + 分类页大图都用它）
  const cats = await prisma.category.findMany({ select: { id: true, slug: true }, orderBy: { slug: "asc" } });
  for (const [i, c] of cats.entries()) {
    const img = saved[i % saved.length];
    if (!dry) {
      await prisma.category.update({
        where: { id: c.id },
        data: { image: img, bannerImage: img, cardImage: img },
      });
    }
    console.log(`✓ 分类 ${c.slug} ← ${img}`);
  }
  await prisma.$disconnect();
  console.log(`\n完成：${dry ? "[dry-run] " : ""}hero ${saved.length} 张，分类 ${cats.length} 个`);
  console.log("⚠️ 版权提醒：图片归原站所有，仅内测；商业发布前必须替换自有素材。");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
