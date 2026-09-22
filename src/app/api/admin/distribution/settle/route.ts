import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { settleDueOrders, settleOrder } from "@/server/services/distribution";

export const runtime = "nodejs";

const schema = z.object({
  /** 指定订单号则强制结算该单（不受持有期限制，用于客诉加急） */
  orderId: z.string().trim().min(1).max(64).optional(),
});

/**
 * POST /api/admin/distribution/settle — 手动结算（P0-5）
 *
 * 为什么需要：持有期到期的自动结算由**进程内调度器**驱动，一旦 `CRON_ENABLED=false`
 * （或调度器异常），佣金会永远停在「在途」、分销商提不了现，而页面看不出任何异常。
 * 这里提供与调度器同一个幂等函数的**手动入口**，后台随点随结。
 */
export const POST = apiHandler(async (req) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const input = await readJson(req, schema).catch(() => ({ orderId: undefined }));

  if (input.orderId) {
    const settled = await settleOrder(input.orderId);
    await audit({
      userId: actor.id,
      action: "DISTRIBUTION_MANUAL_SETTLE_ORDER",
      entity: "Order",
      entityId: input.orderId,
      meta: { settled },
      req,
    });
    return json({ ok: true, mode: "order", orderId: input.orderId, settled });
  }

  const result = await settleDueOrders();
  await audit({
    userId: actor.id,
    action: "DISTRIBUTION_MANUAL_SETTLE_DUE",
    meta: { ...result },
    req,
  });
  return json({ ok: true, mode: "due", ...result });
});
