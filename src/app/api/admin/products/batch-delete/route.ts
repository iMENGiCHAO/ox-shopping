import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { invalidateProductsCache } from "@/lib/cache";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { batchDeleteSchema } from "@/lib/validations/product";

export const runtime = "nodejs";

/**
 * POST /api/admin/products/batch-delete — 批量**物理删除**。
 *
 * 与单删 `/api/admin/products/[id]` 同语义（后台商品管理此前只有批量归档，
 * 大爷 2026-09-20 指出缺批量删除）：
 *  - 商品行物理删除；购物车行按 `onDelete: Cascade` 级联清理
 *  - 订单快照不受影响（OrderItem.productId 可空，历史订单仍可展示）
 *  - 审计记录被删商品 id 与名称（最多记 20 个，避免 meta 过大）
 */
export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  const input = await readJson(req, batchDeleteSchema);

  const rows = await prisma.product.findMany({
    where: { id: { in: input.ids } },
    select: { id: true, name: true },
  });
  if (rows.length === 0) return json({ deleted: 0, names: [] });

  const ids = rows.map((r) => r.id);
  const result = await prisma.product.deleteMany({ where: { id: { in: ids } } });

  await invalidateProductsCache();
  await audit({
    userId: actor.id,
    action: "ADMIN_PRODUCT_BATCH_DELETE",
    entity: "Product",
    meta: {
      ids,
      deleted: result.count,
      names: rows.map((r) => r.name).slice(0, 20),
    },
    req,
  });

  return json({ deleted: result.count, names: rows.map((r) => r.name) });
});
