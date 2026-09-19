import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { captureMessage } from "@/lib/monitoring";
import { effectivePaymentMode } from "@/lib/env";
import { retrieveCheckoutSession } from "@/lib/payment/stripe";
import { getChannelRuntimeByCode } from "@/lib/payment/channel.service";
import { str } from "@/lib/payment/provider";
import { cancelOrder, expireStaleOrders, markOrderPaid } from "@/server/services/order.service";

/**
 * 进程内定时任务（Next instrumentation 启动，无需外部 cron）。
 * 多实例部署时通过 Postgres 事务级咨询锁(pg_try_advisory_xact_lock)选主：
 * 同一时刻只有一个实例持锁执行，事务结束锁自动释放，实例崩溃也无残留。
 */

const LEADER_LOCK_KEY = 918_273_645;
const RECONCILE_AFTER_MS = 10 * 60_000; // 下单 10 分钟后才对账
const RECONCILE_BATCH = 50;

/**
 * 选主事务的超时上限。
 *
 * 必须显式给足：这个事务存在的**唯一**目的是持有
 * `pg_try_advisory_xact_lock`（事务级咨询锁，事务结束即释放），
 * 因此它的存活时长 = 本轮全部任务的耗时。Prisma 的交互事务默认只给 **5s**，
 * 在慢库/慢卷上（本项目的外置卷实测单轮 6.5s+）必然超时：
 * `A commit cannot be executed on an expired transaction` →
 * 每轮心跳都报错告警，而且**事务一死锁就提前释放**，
 * 此时任务可能还在跑，多实例下会被另一个实例重复执行（选主失效）。
 *
 * 5 分钟对本轮任务（超时订单取消 + Token 清理 + 审计归档 + Stripe 对账）
 * 是充裕上界。代价是极端情况下会占住一个连接池连接，属可接受权衡。
 *
 * ⚠️ 遗留设计问题：`runAllJobs()` 里含 Stripe 网络请求，也就是**在数据库事务里做网络 I/O**，
 * 这是不推荐的（事务时长受外部服务延迟支配）。彻底解法是改用「租约表」
 * （lockedUntil 字段 + 条件更新 + 续租）让任务在事务外执行。
 * 当前用「每次外部调用超时上界 + 整轮时间预算」把事务时长**夹在确定范围内**兜底，
 * 重构仍列为后续项。
 */
const LEADER_TX_TIMEOUT_MS = 5 * 60_000;
const LEADER_TX_MAX_WAIT_MS = 10_000;

/** 单次 Stripe 查询的超时上界（毫秒）。必须显式给：SDK 默认 80s 会让持锁事务失去上界。 */
const RECONCILE_REQUEST_TIMEOUT_MS = 8_000;

/**
 * Stripe 对账的整轮时间预算（毫秒）。
 *
 * 为什么需要：`RECONCILE_BATCH` 是 50，即使每次调用都收紧到 8s，
 * 最坏仍是 400s —— 超过 `LEADER_TX_TIMEOUT_MS`(300s)，事务会超时并**提前释放咨询锁**，
 * 于是另一个实例并发跑同一轮（重复工作 + 告警噪声；状态推进本身有原子认领保护，不会重复发货）。
 * 给整轮一个预算后，事务时长 ≤ 预算 + DB 任务耗时，稳定落在事务超时之内。
 * 预算用尽即中断本轮，剩余订单下一轮心跳继续 —— 对账是幂等的，中断是安全的。
 */
const RECONCILE_BUDGET_MS = 120_000;

/** 每个心跳周期执行的全部任务（咨询锁保证多实例只有一个真正执行） */
export async function runScheduledJobs(): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${LEADER_LOCK_KEY}) AS locked`;
        if (!rows[0]?.locked) return; // 其他实例正在执行本轮

        await runAllJobs();
      },
      { timeout: LEADER_TX_TIMEOUT_MS, maxWait: LEADER_TX_MAX_WAIT_MS },
    );
  } catch (err) {
    logger.error({ err }, "[cron] 心跳执行失败");
    captureMessage("[cron] 心跳执行失败", "error");
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

  // 2b. AuditLog 滚动归档：只保留最近 90 天（createdAt 有索引，删除代价可控）
  try {
    const n = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } },
    });
    if (n.count > 0) logger.info({ count: n.count }, "[cron] 90 天前审计日志已清理");
  } catch (err) {
    logger.error({ err }, "[cron] auditLog 清理失败");
  }

  // 3. 掉单对账（仅 Stripe 模式有网关状态可查；mock 支付同步完成无此需求）
  if (effectivePaymentMode === "stripe") {
    try {
      // 渠道化 Stripe：后台配置并启用了 stripe 渠道时，用渠道密钥对账；否则 env
      let stripeKeys: { secretKey?: string } | undefined;
      try {
        const channel = await getChannelRuntimeByCode("stripe");
        const secret = channel?.enabled ? str(channel.config, "secretKey") : "";
        if (secret) stripeKeys = { secretKey: secret };
      } catch {
        /* DB 异常时回落 env 密钥 */
      }
      const pending = await prisma.order.findMany({
        where: {
          status: "PENDING_PAYMENT",
          paymentSessionId: { not: null },
          createdAt: { lt: new Date(Date.now() - RECONCILE_AFTER_MS) },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: RECONCILE_BATCH,
        select: {
          id: true,
          orderNumber: true,
          paymentSessionId: true,
          total: true,
          currency: true,
        },
      });
      // 整轮时间预算：让「持咨询锁的事务」总时长有确定上界（见 RECONCILE_BUDGET_MS 注释）
      const deadline = Date.now() + RECONCILE_BUDGET_MS;
      for (const o of pending) {
        if (Date.now() >= deadline) {
          logger.warn(
            { batch: pending.length },
            "[reconcile] 本轮时间预算用尽，剩余订单下一轮继续（对账幂等，中断安全）",
          );
          break;
        }
        const session = await retrieveCheckoutSession(o.paymentSessionId!, stripeKeys, {
          timeoutMs: RECONCILE_REQUEST_TIMEOUT_MS,
          maxNetworkRetries: 0,
        });
        if (!session) continue;
        if (session.payment_status === "paid") {
          // 资金安全：对账补记前同样校验金额与币种
          const expectedCents = Math.round(Number(o.total) * 100);
          if (session.amount_total !== expectedCents) {
            logger.error(
              {
                orderNumber: o.orderNumber,
                gatewayAmount: session.amount_total,
                expectedAmount: expectedCents,
              },
              "[reconcile] 支付金额不匹配，跳过补记（需人工核对）",
            );
            continue;
          }
          if (
            session.currency &&
            o.currency &&
            session.currency.toLowerCase() !== o.currency.toLowerCase()
          ) {
            logger.error(
              {
                orderNumber: o.orderNumber,
                gatewayCurrency: session.currency,
                orderCurrency: o.currency,
              },
              "[reconcile] 支付币种不匹配，跳过补记",
            );
            continue;
          }
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
