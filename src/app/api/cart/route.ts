import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { addToCart, clearCart, getCart } from "@/server/services/cart.service";
import { audit } from "@/lib/audit";
import { cartAddSchema } from "@/lib/validations/cart-order";

export const runtime = "nodejs";

/** GET /api/cart */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const cart = await getCart(user.id);
  return json(cart);
});

/** POST /api/cart — 添加商品 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, cartAddSchema);

  await addToCart(user.id, input.productId, input.quantity, input.attributes);
  await audit({
    userId: user.id,
    action: "CART_ADD",
    entity: "CartItem",
    entityId: input.productId,
    meta: { quantity: input.quantity },
    req,
  });

  const cart = await getCart(user.id);
  return json(cart);
});

/** DELETE /api/cart — 清空Shopping Bag */
export const DELETE = apiHandler(async () => {
  const user = await requireUser();
  await clearCart(user.id);
  return json({ ok: true });
});
