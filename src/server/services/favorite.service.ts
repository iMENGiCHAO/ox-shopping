import "server-only";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/errors";
import { parsePagination } from "@/lib/utils";

/**
 * 收藏夹服务层（交付终审补全）：极简稳定面 ——
 * @@unique(userId, productId) 之上做 upsert/delete 的 toggle，天然幂等：
 * 双击 = 第二次命中 upsert 已存在行，不再产生重复（边界审计口径）。
 */

/** 切换收藏：已收藏→取消并返回 {favorited:false}；未收藏→加入返回 true。 */
export async function toggleFavorite(userId: string, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw notFound("Product not found");

  const existing = await prisma.favorite.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return { favorited: false as const };
  }
  await prisma.favorite.create({ data: { userId, productId } });
  return { favorited: true as const };
}

/** 我是否收藏了该品（PDP 心形初始态）。 */
export async function isFavorite(userId: string, productId: string): Promise<boolean> {
  const row = await prisma.favorite.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { id: true },
  });
  return row != null;
}

/** 我的收藏列表（account 收藏页）：在售在前的商品快照。 */
export async function listMyFavorites(userId: string, searchParams: URLSearchParams) {
  const { skip, take, page } = parsePagination(searchParams, { page: 1, pageSize: 12 });
  const where = { userId };
  const [rows, total] = await Promise.all([
    prisma.favorite.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            nameEn: true,
            price: true,
            compareAtPrice: true,
            images: true,
            stock: true,
            status: true,
          },
        },
      },
    }),
    prisma.favorite.count({ where }),
  ]);
  return {
    rows: rows
      .filter((r) => r.product != null)
      .map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        product: {
          ...r.product,
          name: r.product.nameEn ?? r.product.name,
          price: Number(r.product.price),
          compareAtPrice: r.product.compareAtPrice == null ? null : Number(r.product.compareAtPrice),
        },
      })),
    total,
    page,
    pageSize: take,
  };
}
