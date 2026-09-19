import { apiHandler, json } from "@/lib/api";
import {
  getProductById,
  getRelatedProducts,
} from "@/server/services/product.service";
import { serializeProduct } from "@/server/serializers";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/**
 * GET /api/products/[id] — Product Details + 相关推荐
 * 参数兼容商品 slug 或商品 id(slug 优先匹配)。
 */
export const GET = apiHandler(async (req, ctx) => {
  const idOrSlug = routeParam(ctx.params.id);

  // slug 优先匹配，其次按 id 查询
  const isSlugLike = idOrSlug.length >= 6 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(idOrSlug);
  const bySlug = isSlugLike ? await prisma.product.findUnique({ where: { slug: idOrSlug } }) : null;

  const product = bySlug ?? (await getProductById(idOrSlug));
  if (product.status !== "ACTIVE") throw notFound("Product not found or no longer available");

  const related = await getRelatedProducts(product.id, product.categoryId, 4);

  return json({
    product: serializeProduct(product),
    related: related.map(serializeProduct),
  });
});
