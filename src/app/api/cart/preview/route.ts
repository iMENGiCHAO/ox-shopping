import { apiHandler, json, searchParam } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { MAX_CART_ITEMS } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * GET /api/cart/preview?ids=a,b,c — 游客Shopping Bag商品信息补全(公开接口)
 * 仅返回 ACTIVE 商品的基础信息(id/name/slug/images/price/stock/status)，
 * 供未登录用户在本地Shopping Bag页面展示商品名称、价格与库存。
 * 同时下发 variants（组合明细）：游客购物袋/结账页按**所选规格**用
 * variantAvailableQuantity 同口径计算组合可售量 —— 商品总库存是全部组合
 * 之和，回落会让「黑/S 售罄但白/M 有货」的售罄组合在游客端显示有货、
 * 结账提交才报错（与登录用户的口径保持一致）。
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
      // 游客车与游客结账页需要用同一谓词判断「售罄但仍可购」：
      // 预售商品 stock=0 仍是可购状态，漏传会让购物车/结账摘要误判或丢失预售标识。
      isPresale: true,
      // 组合明细（仅 active）：前端按行规格算组合可售量（与登录用户同口径）
      variants: {
        where: { isActive: true },
        select: { attributes: true, stock: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return json({ products });
});
