import "server-only";
import { prisma } from "@/lib/prisma";
import { searchSizeChartSlugs, SIZE_CHART_SLUGS } from "@/components/shop/size-chart-data";

/** 商品参数对照表检索：数据库 sizeChart JSON + 代码内置注册表合并命中 */
export async function searchSizeChartProducts(
  q: string,
): Promise<{ slug: string; name: string }[]> {
  const query = q.trim().toLowerCase();
  if (!query) return [];

  const chartTextHits = searchSizeChartSlugs(query);
  const dbHits = await prisma.$queryRaw<{ slug: string }[]>`
    SELECT slug FROM products
    WHERE status = 'ACTIVE' AND "sizeChart" IS NOT NULL AND "sizeChart"::text ILIKE ${`%${query}%`}
    LIMIT 12`.catch(() => []);

  // 代码内置参数表的商品：表内容命中 或 商品名称命中 均算（官方 Pages 结果含 Size Chart 商品）
  const chartHolders =
    SIZE_CHART_SLUGS.length > 0
      ? await prisma.product
          .findMany({
            where: { slug: { in: SIZE_CHART_SLUGS }, status: "ACTIVE" },
            select: { slug: true, name: true, nameEn: true },
          })
          .catch(() => [])
      : [];
  const nameHits = chartHolders.filter(
    (p) => p.name.toLowerCase().includes(query) || (p.nameEn ?? "").toLowerCase().includes(query),
  );

  const slugs = [
    ...new Set([...chartTextHits, ...dbHits.map((p) => p.slug), ...nameHits.map((p) => p.slug)]),
  ].slice(0, 6);
  if (slugs.length === 0) return [];

  const bySlug = new Map(chartHolders.map((p) => [p.slug, p]));
  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    const extra = await prisma.product
      .findMany({
        where: { slug: { in: missing }, status: "ACTIVE" },
        select: { slug: true, name: true, nameEn: true },
      })
      .catch(() => []);
    for (const p of extra) bySlug.set(p.slug, p);
  }
  return slugs
    .map((s) => bySlug.get(s))
    .filter((p): p is { slug: string; name: string; nameEn: string | null } => Boolean(p))
    .map(({ slug, name }) => ({ slug, name }));
}
