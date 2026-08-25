import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { removeCartItem, updateCartItem } from "@/server/services/cart.service";
import { cartUpdateSchema } from "@/lib/validations/cart-order";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** PUT /api/cart/[id] — 修改数量 */
export const PUT = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, cartUpdateSchema);

  await updateCartItem(user.id, id, input.quantity);
  return json({ ok: true });
});

/** DELETE /api/cart/[id] */
export const DELETE = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const id = routeParam(ctx.params.id);

  await removeCartItem(user.id, id);
  return json({ ok: true });
});
