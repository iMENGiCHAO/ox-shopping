import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getCart, mergeLocalCart } from "@/server/services/cart.service";
import { cartMergeSchema } from "@/lib/validations/cart-order";
import { getLang } from "@/lib/shop-i18n-server";

export const runtime = "nodejs";

/** POST /api/cart/merge — 合并游客本地Shopping Bag */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, cartMergeSchema);

  await mergeLocalCart(user.id, input.items);
  // 商品名按请求语种挑（P2-1）：英文界面拿 nameEn，中文拿 name
  const cart = await getCart(user.id, await getLang());
  return json(cart);
});
