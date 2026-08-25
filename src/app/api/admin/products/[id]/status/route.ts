import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { serializeProduct } from "@/server/serializers";
import { notifyRestock } from "@/server/services/notify-me.service";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { productStatusUpdateSchema } from "@/lib/validations/product";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** PATCH /api/admin/products/[id]/status */
export const PATCH = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, productStatusUpdateSchema);

  const product = await prisma.product.update({
    where: { id },
    data: { status: input.status },
    include: { category: true },
  });

  // 上架（到货回归在售）：触发到货通知（服务内部校验库存>0 与规格匹配）
  if (input.status === "ACTIVE") {
    void notifyRestock(id);
  }

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_PRODUCT_STATUS",
    entity: "Product",
    entityId: id,
    meta: { status: input.status },
    req,
  });
  return json({ product: serializeProduct(product) });
});
