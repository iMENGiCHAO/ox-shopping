import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { notifyRestock } from "@/server/services/notify-me.service";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { batchStatusSchema } from "@/lib/validations/product";

export const runtime = "nodejs";

/** POST /api/admin/products/batch-status — 批量改状态 */
export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  const input = await readJson(req, batchStatusSchema);

  const result = await prisma.product.updateMany({
    where: { id: { in: input.ids } },
    data: { status: input.status },
  });

  // 批量上架：逐个触发到货通知（服务内部校验库存与规格匹配，未满足的自动跳过）
  if (input.status === "ACTIVE") {
    for (const id of input.ids) {
      void notifyRestock(id);
    }
  }

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_PRODUCT_BATCH_STATUS",
    entity: "Product",
    meta: { ids: input.ids, status: input.status, updated: result.count },
    req,
  });
  return json({ updated: result.count });
});
