/* eslint-disable no-console */
/**
 * 把内置 FAQ 兜底内容写入数据库（后台「FAQ 管理」即可继续编辑）。
 *
 * 运行：npx tsx scripts/seed-faqs.ts [--force]
 *
 * 默认**仅在 faqs 表为空时**写入 —— 避免覆盖运营在后台已经改过的问答。
 * 加 `--force` 会清空并重灌（用于演示/重置环境）。
 *
 * 数据源：src/lib/faq-defaults.ts（覆盖 shop.x.com /pages/faqs 实测的 10 个主题）。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { FAQ_DEFAULTS } from "../src/lib/faq-defaults";

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes("--force");
  const existing = await prisma.faq.count();

  if (existing > 0 && !force) {
    console.log(`faqs 已有 ${existing} 条记录，跳过（需要重灌请加 --force）`);
    return;
  }
  if (existing > 0 && force) {
    await prisma.faq.deleteMany({});
    console.log(`已清空 ${existing} 条旧记录`);
  }

  await prisma.faq.createMany({
    data: FAQ_DEFAULTS.map((f, i) => ({
      question: f.question,
      answer: f.answer,
      questionEn: f.questionEn,
      answerEn: f.answerEn,
      sortOrder: i,
      published: true,
    })),
  });
  console.log(`已写入 ${FAQ_DEFAULTS.length} 条 FAQ`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
