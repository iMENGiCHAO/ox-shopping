import { apiHandler, json, searchParam } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { MAX_CART_ITEMS } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * GET /api/cart/preview?ids=a,b,c — 游客Shopping Bag商品信息补全(公开接口)
 * 仅返回 ACTIVE 商品的基础信息(id/name/slug/images/price/stock/status)，
 * 供未登录用户在本地Shopping Bag页面展示商品名称、价格与库存。
 */
export const GET = apiHandler(async (req) => {
  const raw = searchParam(new URL(req.url).searchParams, "ids");
  if (!raw) return json({ products: [] });

  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ].slice(0, MAX_CART_ITEMS);

  if (ids.length === 0) return json({ products: [] });

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      slug: true,
      images: true,
      price: true,
      stock: true,
      status: true,
    },
  });

  return json({ products });
});
