import { apiHandler, json } from "@/lib/api";
import {
  getProductById,
  getRatingStats,
  getRelatedProducts,
} from "@/server/services/product.service";
import { getSessionUser } from "@/lib/auth/session";
import { serializeProduct } from "@/server/serializers";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/**
 * GET /api/products/[id] — Product Details + 评分 + 相关推荐 + 收藏状态
 * 参数兼容商品 slug 或商品 id(slug 优先匹配)。
 * (路由参数统一命名为 id，与 /api/products/[id]/reviews 保持一致)
 */
export const GET = apiHandler(async (req, ctx) => {
  const idOrSlug = routeParam(ctx.params.id);

  // slug 优先匹配，其次按 id 查询
  const isSlugLike = idOrSlug.length >= 6 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(idOrSlug);
  const bySlug = isSlugLike ? await prisma.product.findUnique({ where: { slug: idOrSlug } }) : null;

  const product = bySlug ?? (await getProductById(idOrSlug));
  if (product.status !== "ACTIVE") throw notFound("商品不存在或已下架");

  const [ratingStats, related] = await Promise.all([
    getRatingStats(product.id),
    getRelatedProducts(product.id, product.categoryId, 4),
  ]);

  let favorited = false;
  const session = await getSessionUser();
  if (session) {
    const fav = await prisma.favorite.findUnique({
      where: { userId_productId: { userId: session.id, productId: product.id } },
    });
    favorited = !!fav;
  }

  return json({
    product: serializeProduct(product),
    ratingStats,
    related: related.map(serializeProduct),
    favorited,
  });
});
