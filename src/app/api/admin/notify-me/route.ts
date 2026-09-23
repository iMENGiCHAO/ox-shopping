import { apiHandler, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";

export const runtime = "nodejs";

const PAGE_SIZE = 200;

/**
 * GET /api/admin/notify-me — 到货通知订阅列表（联出客户关注的商品信息）。
 * `?cursor=<id>&limit=200` 使用稳定 id 游标翻页；默认仍返回首批 200，向后兼容。
 */
export const GET = apiHandler(async (req) => {
  await requireStaff();
  const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
  const requested = Number(req.nextUrl.searchParams.get("limit") ?? PAGE_SIZE);
  const take = Number.isFinite(requested)
    ? Math.min(Math.max(Math.floor(requested), 1), PAGE_SIZE)
    : PAGE_SIZE;
  const rows = await prisma.notifyMe.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  // NotifyMe 与 Product 无外键关系，手动联表补商品名/图片
  const productIds = [...new Set(rows.map((r) => r.productId).filter((v): v is string => !!v))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, nameEn: true, slug: true, images: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  return json({
    items: rows.map((r) => ({
      ...r,
      product: r.productId ? (productMap.get(r.productId) ?? null) : null,
    })),
    nextCursor: rows.length === take ? (rows[rows.length - 1]?.id ?? null) : null,
  });
});
