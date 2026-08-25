import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getCart, mergeLocalCart } from "@/server/services/cart.service";
import { cartMergeSchema } from "@/lib/validations/cart-order";

export const runtime = "nodejs";

/** POST /api/cart/merge — 合并游客本地Shopping Bag */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, cartMergeSchema);

  await mergeLocalCart(user.id, input.items);
  const cart = await getCart(user.id);
  return json(cart);
});
