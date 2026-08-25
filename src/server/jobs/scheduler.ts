import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { effectivePaymentMode } from "@/lib/env";
import { retrieveCheckoutSession } from "@/lib/payment/stripe";
import { cancelOrder, expireStaleOrders, markOrderPaid } from "@/server/services/order.service";

/**
 * 进程内定时任务（Next instrumentation 启动，无需外部 cron）。
 * 多实例部署时通过 Postgres 事务级咨询锁(pg_try_advisory_xact_lock)选主：
 * 同一时刻只有一个实例持锁执行，事务结束锁自动释放，实例崩溃也无残留。
 */

const LEADER_LOCK_KEY = 918_273_645;
const RECONCILE_AFTER_MS = 10 * 60_000; // 下单 10 分钟后才对账
const RECONCILE_BATCH = 50;

/** 每个心跳周期执行的全部任务（咨询锁保证多实例只有一个真正执行） */
export async function runScheduledJobs(): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${LEADER_LOCK_KEY}) AS locked`;
      if (!rows[0]?.locked) return; // 其他实例正在执行本轮

      await runAllJobs();
    });
  } catch (err) {
    logger.error({ err }, "[cron] 心跳执行失败");
  }
}

async function runAllJobs(): Promise<void> {
  // 1. 超时未支付订单自动取消（回补库存）
  try {
    const n = await expireStaleOrders();
    if (n > 0) logger.info({ count: n }, "[cron] 过期未支付订单已自动取消");
  } catch (err) {
    logger.error({ err }, "[cron] expireStaleOrders 失败");
  }

  // 2. 过期/已撤销 Refresh Token 清理（保留审计窗口：过期 7 天、撤销 30 天后删除）
  try {
    const n = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
          { revokedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
        ],
      },
    });
    if (n.count > 0) logger.info({ count: n.count }, "[cron] 过期 Refresh Token 已清理");
  } catch (err) {
    logger.error({ err }, "[cron] refreshToken 清理失败");
  }

  // 3. 掉单对账（仅 Stripe 模式有网关状态可查；mock 支付同步完成无此需求）
  if (effectivePaymentMode === "stripe") {
    try {
      const pending = await prisma.order.findMany({
        where: {
          status: "PENDING_PAYMENT",
          paymentSessionId: { not: null },
          createdAt: { lt: new Date(Date.now() - RECONCILE_AFTER_MS) },
        },
        orderBy: { createdAt: "asc" },
        take: RECONCILE_BATCH,
        select: { id: true, orderNumber: true, paymentSessionId: true },
      });
      for (const o of pending) {
        const session = await retrieveCheckoutSession(o.paymentSessionId!);
        if (!session) continue;
        if (session.payment_status === "paid") {
          // 网关侧已支付但本地未标记（webhook 丢失）→ 补标记
          await markOrderPaid(
            o.orderNumber,
            typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          );
          logger.warn({ orderNumber: o.orderNumber }, "[reconcile] 补记已支付订单");
        } else if (session.status === "expired") {
          const fresh = await prisma.order.findUnique({ where: { orderNumber: o.orderNumber } });
          if (fresh && fresh.status === "PENDING_PAYMENT") {
            await cancelOrder(fresh, null);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "[cron] Stripe 对账失败");
    }
  }
}
