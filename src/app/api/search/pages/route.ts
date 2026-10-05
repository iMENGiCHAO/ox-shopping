import { apiHandler, json, searchParam } from "@/lib/api";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { getClientIp } from "@/lib/server/utils-server";
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
  // 限流 + 长度上限（安全审计）：公开端点 + ILIKE 全表扫，无限流可刷满 DB CPU
  const rl = await rateLimit({
    key: `search-pages:${getClientIp(req)}`,
    ...RATE_LIMITS.searchPages,
  });
  if (!rl.ok) throw rateLimited();
  const q = (searchParam(new URL(req.url).searchParams, "q") ?? "").trim().slice(0, 80);
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
