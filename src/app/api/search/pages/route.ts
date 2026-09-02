import { apiHandler, json, searchParam } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { matchSearchablePages } from "@/lib/searchable-pages";
import { searchSizeChartProducts } from "@/server/services/chart-search";

export const runtime = "nodejs";

export interface SearchPageResult {
  type: "page" | "faq" | "sizechart";
  title: string;
  href: string;
}

/** GET /api/search/pages?q= — Pages 检索：静态页面 + FAQ 内容 + 商品参数对照表（官方同构） */
export const GET = apiHandler(async (req) => {
  const q = (searchParam(new URL(req.url).searchParams, "q") ?? "").trim();
  if (!q) return json({ pages: [] });

  const pages: SearchPageResult[] = matchSearchablePages(q).map((pg) => ({
    type: "page",
    title: pg.title,
    href: pg.href,
  }));

  const faqs = await prisma.faq
    .findMany({
      where: {
        published: true,
        OR: [
          { question: { contains: q, mode: "insensitive" } },
          { answer: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 6,
      select: { question: true },
    })
    .catch(() => []);
  const faqResults: SearchPageResult[] = faqs.map((f) => ({
    type: "faq",
    title: f.question,
    href: "/pages/faqs",
  }));

  // 商品参数对照表：数据库 sizeChart + 代码内置注册表（官方 Pages 结果含 Size Chart）
  const charts = await searchSizeChartProducts(q);
  const chartResults: SearchPageResult[] = charts.map((p) => ({
    type: "sizechart",
    title: p.name,
    href: `/products/${p.slug}`,
  }));

  return json({ pages: [...pages, ...faqResults, ...chartResults] });
});
