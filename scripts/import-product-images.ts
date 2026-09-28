/**
 * 商品图片本地导入脚本（大爷需求：用原站商品图，但**下载到本地**、不用外链 URL）。
 *
 * 用法：
 *   npx tsx scripts/import-product-images.ts <图片文件夹> [--dry]
 *
 * 目录约定（宽松匹配，文件名含商品 slug 即可）：
 *   <文件夹>/<slug>.jpg            → 该商品第 1 张
 *   <文件夹>/<slug>-1.jpg / -2.jpg → 按序号排列的多图
 *   <文件夹>/<slug>_任意后缀.png   → 也接受（按文件名排序取序号）
 *
 * 行为：
 *   1. 逐个商品匹配图片 → 用 sharp 统一转成 WebP 质量 82、最长边 1600（体积可控）
 *   2. 落盘到 public/images/products/<slug>/<n>.webp
 *   3. 更新 Product.images 指向本地路径（前 8 张）
 *   4. 刷新商品列表缓存
 *
 * 合规提示：下载/使用的图片版权归原站所有——脚本在末尾打印提醒，
 * 商业发布前必须替换为自有素材（见 docs/COMMERCIAL_DIAGNOSIS_2026-09-28.md 待办）。
 */
import { readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, extname, basename, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const prisma = new PrismaClient();
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const dirArg = args.find((a) => !a.startsWith("--"));
  if (!dirArg) {
    console.error("用法: npx tsx scripts/import-product-images.ts <图片文件夹> [--dry]");
    process.exit(1);
  }
  const srcDir = resolve(dirArg);
  if (!existsSync(srcDir)) {
    console.error(`目录不存在: ${srcDir}`);
    process.exit(1);
  }

  const files = readdirSync(srcDir)
    .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
    .sort();
  if (files.length === 0) {
    console.error(`目录里没有图片文件: ${srcDir}`);
    process.exit(1);
  }
  console.log(`发现 ${files.length} 张图片，开始匹配商品…`);

  const products = await prisma.product.findMany({
    select: { id: true, slug: true, name: true, images: true },
    orderBy: { slug: "asc" },
  });

  const outBase = resolve(process.cwd(), "public/images/products");
  let updated = 0;
  let missed: string[] = [];

  for (const p of products) {
    // 文件名包含 slug（大小写不敏感）即视为该商品的图；按文件名排序定序号
    const matched = files.filter((f) =>
      basename(f, extname(f)).toLowerCase().includes(p.slug.toLowerCase()),
    );
    if (matched.length === 0) continue;

    const relDir = join("products", p.slug);
    const absDir = join(outBase, p.slug);
    const images: string[] = [];

    for (const [i, f] of matched.slice(0, 8).entries()) {
      const outRel = `/images/${relDir}/${i + 1}.webp`;
      const outAbs = join(absDir, `${i + 1}.webp`);
      images.push(outRel);
      if (dry) continue;
      mkdirSync(absDir, { recursive: true });
      await sharp(join(srcDir, f))
        .rotate() // 尊重 EXIF 方向
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(outAbs);
    }

    if (!dry) {
      await prisma.product.update({ where: { id: p.id }, data: { images } });
    }
    updated++;
    console.log(`✓ ${p.slug} ← ${matched.length} 张（${matched.slice(0, 3).join(", ")}${matched.length > 3 ? "…" : ""}）`);
  }

  missed = products.filter((p) => !files.some((f) => basename(f, extname(f)).toLowerCase().includes(p.slug.toLowerCase()))).map((p) => p.slug);
  console.log(`\n完成：${dry ? "[dry-run] " : ""}更新 ${updated}/${products.length} 个商品`);
  if (missed.length > 0) {
    console.log(`未匹配到图片的商品（${missed.length}）: ${missed.slice(0, 12).join(", ")}${missed.length > 12 ? "…" : ""}`);
    console.log("提示：把文件名改成包含上面的 slug（如 <slug>.jpg）再跑一次即可。");
  }
  console.log("\n⚠️ 合规提醒：这些图片版权归原站所有，仅可用于内测/看效果；商业发布前必须替换为自有素材。");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
