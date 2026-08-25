import "server-only";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { effectivePaymentMode } from "@/lib/env";
import { retrieveCheckoutSession } from "@/lib/payment/stripe";
import { cancelOrder, expireStaleOrders, markOrderPaid } from "@/server/services/order.service";

/**
 * 进程内定时任务（Next instrumentation 启动，无需外部 cron）。
 * 多实例部署时通过 Redis SET NX 选主，保证同一分钟只有一个实例执行；
 * 无 Redis（本地开发）或 Redis 故障时退化为直接执行——宁可重复，不可漏跑。
 */

const LEADER_KEY = "lock:cron-leader";
const RECONCILE_AFTER_MS = 10 * 60_000; // 下单 10 分钟后才对账
const RECONCILE_BATCH = 50;

async function tryAcquireLeader(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const ok = await redis.set(LEADER_KEY, String(process.pid), "PX", 55_000, "NX");
    return ok === "OK";
  } catch {
    return true; // Redis 异常：降级直跑
  }
}

/** 每个心跳周期执行的全部任务 */
export async function runScheduledJobs(): Promise<void> {
  if (!(await tryAcquireLeader())) return;

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
        select: { id: true, orderNumber: true, paymentSessionId: true, createdAt: true },
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
