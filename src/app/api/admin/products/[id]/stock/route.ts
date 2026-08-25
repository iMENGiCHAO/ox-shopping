import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { serializeProduct } from "@/server/serializers";
import { notifyRestock } from "@/server/services/notify-me.service";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { stockUpdateSchema } from "@/lib/validations/product";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** PATCH /api/admin/products/[id]/stock */
export const PATCH = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, stockUpdateSchema);

  const before = await prisma.product.findUnique({ where: { id }, select: { stock: true } });

  const product = await prisma.product.update({
    where: { id },
    data: { stock: input.stock },
    include: { category: true },
  });

  // 补货（0→有货）：触发到货通知（服务内部按客户登记的规格逐条匹配）
  if ((before?.stock ?? 0) <= 0 && input.stock > 0) {
    void notifyRestock(id);
  }

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_PRODUCT_STOCK",
    entity: "Product",
    entityId: id,
    meta: { stock: input.stock },
    req,
  });
  return json({ product: serializeProduct(product) });
});
