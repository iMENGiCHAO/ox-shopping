import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { favoriteToggleSchema } from "@/lib/validations/review";
import { listMyFavorites, toggleFavorite } from "@/server/services/favorite.service";

/** 我的收藏列表（account 收藏页） */
export const GET = apiHandler(async (req) => {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const data = await listMyFavorites(user.id, searchParams);
  return json(data);
});

/** 切换收藏（upsert 唯一约束上，双击幂等） */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, favoriteToggleSchema);
  const result = await toggleFavorite(user.id, input.productId);
  return json(result);
});
