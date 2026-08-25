import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * 支付流水日志：资金事件的追加式审计轨迹（对账/争议仲裁依据）。
 * 写入失败绝不影响主流程——日志缺失可在对账任务中补齐。
 */
export interface PaymentLogEntry {
  orderId?: string | null;
  provider: "stripe" | "mock" | string;
  event:
    | "checkout_created"
    | "paid"
    | "reconcile_paid"
    | "refund_requested"
    | "refunded"
    | "refund_rejected"
    | string;
  amount?: number | null;
  gatewayId?: string | null;
  payload?: unknown;
}

export async function logPayment(entry: PaymentLogEntry): Promise<void> {
  try {
    await prisma.paymentLog.create({
      data: {
        orderId: entry.orderId ?? null,
        provider: entry.provider,
        event: entry.event,
        amount: entry.amount ?? null,
        gatewayId: entry.gatewayId ?? null,
        payload: (entry.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    logger.warn({ err }, "[payment-log] 写入失败");
  }
}
