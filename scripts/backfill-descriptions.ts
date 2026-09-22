/* eslint-disable no-console */
/**
 * 商品描述段落回填（一次性）。
 *
 * 背景：`prisma/xcom-catalog.ts` 的 description 是从官方 `/products.json` 的 `body_html`
 * 生成的，而生成时**剥 `<p>` 标签把段落分隔一起丢了** ⇒ 全部 30 条都是一整块长文本。
 * PDP 的 `.desc-prose` 明明按空行切段（`split(/\n\s*\n|\n/)`），却因为数据里没有 `\n`
 * 而永远只渲染一段 —— 375 下比原站少 2 个段间距（≈32px）。
 *
 * 现在 catalog 里已经补回 `\n\n`（断点取自官方 body_html 的 `<p>` 结构），
 * 但 `prisma/seed.ts` 用的是 `upsert({ update: {} })` —— **幂等、不覆盖已有行**，
 * 所以重跑 seed 不会更新线上已有商品，必须用本脚本做一次定向回填。
 *
 * 用法：
 *   npm run db:backfill-descriptions            # 干跑，只报告差异
 *   npm run db:backfill-descriptions -- --apply # 真正写库
 *
 * 幂等：只写「与 catalog 不一致」的行；重复执行第二次就是 0 条改动。
 * 只动 description / descriptionEn 两个字段，不碰价格、库存、图片等。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { xcomProducts } from "../prisma/xcom-catalog";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const withParas = xcomProducts.filter((p) => (p.description ?? "").includes("\n")).length;
  console.log(`catalog 里带段落分隔的商品：${withParas} / ${xcomProducts.length}`);

  let diff = 0;
  let updated = 0;
  for (const p of xcomProducts) {
    const row = await prisma.product.findUnique({
      where: { slug: p.slug },
      select: { id: true, description: true, descriptionEn: true },
    });
    if (!row) continue;
    // seed 里 description 与 descriptionEn 同值（都是英文原文）
    if (row.description === p.description && row.descriptionEn === p.description) continue;
    diff++;
    if (APPLY) {
      await prisma.product.update({
        where: { id: row.id },
        data: { description: p.description, descriptionEn: p.description },
      });
      updated++;
    }
  }

  if (!APPLY) {
    console.log(`\n干跑：${diff} 条与 catalog 不一致（加 --apply 才会写库）`);
    return;
  }
  console.log(`\n已更新 ${updated} 条（不一致 ${diff} 条）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
