import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { batchOrderStatusSchema } from "@/lib/validations/admin";
import { updateOrderStatus } from "@/server/services/order.service";
import type { Order, OrderItem } from "@prisma/client";

export const runtime = "nodejs";

/**
 * POST /api/admin/orders/batch-status — 批量修改订单状态（缺陷报告 P1-8）。
 *
 * 为什么需要：大促后动辄几十上百单待发货，逐单点开改状态是纯人工损耗。
 *
 * 设计要点：
 * 1. **逐单串行**执行 `updateOrderStatus`（而非一个 UPDATE 批量刷）：
 *    状态变更自带副作用 —— 取消要回补库存、退款要走网关、发货要发邮件、
 *    COD 取消要走现金特例。绕过 service 直接批量写库会造成「订单已退款但钱没退」
 *    这类资金事故（这正是原作者把副作用集中进 service 的原因）。
 * 2. **逐单收集成败**，部分失败不影响其余：返回 ok/failed 明细，运营可重试失败项。
 * 3. 权限分级：REFUNDED 是真金白银出账，仅 ADMIN；其余状态 ADMIN/SUPPORT 均可。
 * 4. 与单笔接口同规则：DELIVERED 不在批量允许列表内（确认收货是顾客的权利）。
 */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, batchOrderStatusSchema);

  // 金额敏感操作单独提权：批量退款必须 ADMIN
  const actor = input.status === "REFUNDED" ? await requireAdmin() : await requireStaff();

  const orders = await prisma.order.findMany({
    where: { id: { in: input.ids } },
    orderBy: { createdAt: "asc" },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));

  const results: {
    id: string;
    orderNumber: string | null;
    ok: boolean;
    error?: string;
  }[] = [];

  for (const id of input.ids) {
    const order = byId.get(id);
    if (!order) {
      results.push({ id, orderNumber: null, ok: false, error: "订单不存在" });
      continue;
    }
    // 已是目标状态：视为成功（幂等，避免运营重复点按钮看到一片失败）
    if (order.status === input.status) {
      results.push({ id, orderNumber: order.orderNumber, ok: true });
      continue;
    }
    try {
      await updateOrderStatus(order as Order & { items: OrderItem[] }, input.status, {
        id: actor.id,
        name: actor.name,
      });
      results.push({ id, orderNumber: order.orderNumber, ok: true });
    } catch (err) {
      results.push({
        id,
        orderNumber: order.orderNumber,
        ok: false,
        error: err instanceof Error ? err.message : "更新失败",
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return json({
    ok: results.length - failed.length,
    failedCount: failed.length,
    total: results.length,
    results,
  });
});
