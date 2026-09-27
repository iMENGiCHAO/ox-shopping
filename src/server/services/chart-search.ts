import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * 商品参数对照表检索（2026-09-26 数据孤岛迁移后）：只查 DB sizeChart。
 * 此前与前端内置注册表合并命中 —— 注册表删除后语义等价迁移：
 *   ① 内容命中：sizeChart JSON 文本 ILIKE（含表头/行值，如搜 "40"、"XL"）
 *   ② 名称命中：配置了参数表的商品名匹配（如搜商品名关键词）
 * 两条 SQL 均有 status='ACTIVE' 守卫，与原实现过滤口径一致。
 */
export async function searchSizeChartProducts(
  q: string,
): Promise<{ slug: string; name: string }[]> {
  const query = q.trim().toLowerCase();
  if (!query) return [];

  const like = `%${query}%`;
  const rows = await prisma.$queryRaw<{ slug: string; name: string }[]>`
    SELECT slug, COALESCE("nameEn", name) AS name FROM products
    WHERE status = 'ACTIVE' AND "sizeChart" IS NOT NULL
      AND ("sizeChart"::text ILIKE ${like} OR name ILIKE ${like} OR COALESCE("nameEn", '') ILIKE ${like})
    ORDER BY "createdAt" DESC
    LIMIT 12`.catch(() => []);

  return rows.slice(0, 6).map((p) => ({ slug: p.slug, name: p.name }));
}
