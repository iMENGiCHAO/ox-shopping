import { apiHandler, json, readJson } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { routeParam } from "@/app/api/_lib/params";
import { onFavoriteCreated } from "@/server/services/price-alert.service";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({ lang: z.enum(["zh", "en"]).optional() }).optional();

/** POST /api/user/favorites/[productId] — 收藏/取消收藏（切换）
 *  收藏时自动建立降价通知订阅（price_alert by favoriteId 1:1）
 */
export const POST = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const productId = routeParam(ctx.params.productId);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw notFound("商品不存在");

  let body: { lang?: "zh" | "en" } | null = null;
  try {
    const parsed = await readJson(req, bodySchema);
    body = parsed ?? null;
  } catch {
    body = null;
  }
  const lang = body?.lang ?? null;

  const existing = await prisma.favorite.findUnique({
    where: { userId_productId: { userId: user.id, productId } },
  });
  if (existing) {
    // 取消收藏：cascade 自动删 price_alert
    await prisma.favorite.delete({ where: { id: existing.id } });
    return json({ favorited: false });
  }
  // 收藏：建 favorite → 同步建 price_alert
  const fav = await prisma.favorite.create({
    data: { userId: user.id, productId, lang },
  });
  await onFavoriteCreated({
    favoriteId: fav.id,
    userId: user.id,
    productId,
    lang,
  });
  return json({ favorited: true });
});
