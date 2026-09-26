import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { captureMessage } from "@/lib/monitoring";
import { effectivePaymentMode } from "@/lib/env";
import { retrieveCheckoutSession } from "@/lib/payment/stripe";
import { getChannelRuntimeByCode } from "@/lib/payment/channel.service";
import { str } from "@/lib/payment/provider";
import {
  cancelOrder,
  expireStaleOrders,
  markOrderPaid,
  processRefundOutboxItem,
} from "@/server/services/order.service";
import { distributionBridge } from "@/server/services/distribution/bridge";
import { drainMailOutbox } from "@/server/services/mail-outbox.service";

/**
 * 进程内定时任务（Next instrumentation 启动，无需外部 cron）。
 * 多实例部署通过 Postgres 租约表(scheduler_lease)选主：同一时刻只有一个
 * 实例持有租约执行；实例崩溃后租约 55s 自然过期，其他实例下轮接管。
 */

const RECONCILE_AFTER_MS = 10 * 60_000; // 下单 10 分钟后才对账
const RECONCILE_BATCH = 50;

/* 性能审计降频守卫：分销对账（补偿性质）5 分钟一轮；团队业绩 rollup（天级
 * 新鲜度足够）每小时一轮。此前两者都跟着 60s 心跳每轮跑。 */
const RECONCILE_JOB_INTERVAL_MS = 5 * 60_000;
const ROLLUP_JOB_INTERVAL_MS = 60 * 60_000;
let lastReconcileAt = 0;
let lastRollupAt = 0;

/**
 * 选主：租约表（scheduler_lease 单行）+ 原子条件更新 —— 2026-09-26 性能审计
 * 的长事务重构落地。
 *
 * 此前设计（已废弃）：整轮任务包在最长 5 分钟的**事务**里持
 * `pg_try_advisory_xact_lock`。两个投产级问题：
 *   1. 事务时长 = 本轮全部任务耗时（含 Stripe 网络调用）→ 常驻占 1 个
 *      连接池连接（Prisma 未显式配 connection_limit 的小规格实例上与页面
 *      聚合争抢）；
 *   2. 每分钟存在的分钟级长事务阻碍 autovacuum 回收死元组 ——
 *      orders / commission_logs 都是高频更新表，投产后表膨胀 + 统计信息
 *      失真的风险真实存在。
 *
 * 现行设计：`INSERT ... ON CONFLICT (id) DO UPDATE ... WHERE lockedUntil < now()`
 * 单条原子语句抢租约（毫秒级短事务）→ 抢到后任务在**事务外**执行
 * （网络 IO 不再占事务；各任务内部自己的短事务照旧）。租约 TTL 55s 略短于
 * 心跳 60s：实例崩溃后租约自然过期，任何实例下轮接管，无残留锁。
 * 任务本身全部幂等（事件级 claim + 订单级 CAS + 计提三层幂等），
 * 极端情况下租约过期后另一实例提前接棒跑同一轮也是安全的。
 */
const LEASE_TTL_MS = 55_000;
/** 进程内防重入：上一轮未跑完时跳过本轮（interval 重触发），不做排队。 */
let jobsInFlight = false;

/** 单次 Stripe 查询的超时上界（毫秒）。必须显式给：SDK 默认 80s 会让单轮失去上界。 */
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

/**
 * 退款 outbox 自动重试（P1：此前退款只在管理员「批准」时同步执行一次，
 * 网关失败/未确认的 RETRY 项永远无人认领 → 退款静默卡死，只能人工反复重批）。
 * `processRefundOutboxItem` 自带「认领租约 + 5 分钟过期抢占」，幂等且并发安全，
 * 这里只负责扫描到期项。网关调用已移出租约事务外执行（长事务重构），
 * 批大小 + 时间预算双上界仍保留：保证单轮时长有确定边界，任务中断安全。
 */
const REFUND_OUTBOX_BATCH = 10;
const REFUND_OUTBOX_BUDGET_MS = 90_000;

/** 每个心跳周期执行的全部任务（租约保证多实例只有一个真正执行） */
export async function runScheduledJobs(): Promise<void> {
  if (jobsInFlight) return; // 上一轮还没跑完：跳过本轮（任务幂等，不排队）
  jobsInFlight = true;
  try {
    const acquired = await acquireLease();
    if (!acquired) return; // 其他实例持有租约，本轮让位
    await runAllJobs(); // 事务外执行：网络 IO 不再占数据库事务
  } catch (err) {
    logger.error({ err }, "[cron] 心跳执行失败");
    captureMessage("[cron] 心跳执行失败", "error");
  } finally {
    jobsInFlight = false;
  }
}

/** 原子抢租约：单条 INSERT ON CONFLICT DO UPDATE ... WHERE 过期才可抢 */
async function acquireLease(): Promise<boolean> {
  const holder = `inst-${process.pid}`;
  const now = new Date();
  const until = new Date(Date.now() + LEASE_TTL_MS);
  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO scheduler_lease (id, "lockedUntil", holder, "updatedAt")
    VALUES (1, ${until}, ${holder}, now())
    ON CONFLICT (id) DO UPDATE
      SET "lockedUntil" = ${until}, holder = ${holder}, "updatedAt" = now()
      WHERE scheduler_lease."lockedUntil" < ${now}
    RETURNING id`;
  return rows.length > 0;
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

  // 2b. AuditLog 滚动清理：默认保留 3 年（1095 天）——金融/电商审计留存
  //     常要求 1-3 年，此前 90 天对商业交付偏短（createdAt 有索引，删除代价可控）。
  //     有更严格合规要求的市场，按当地法务调整窗口（或改为归档导出而非删除）。
  try {
    const n = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 3 * 365 * 86_400_000) } },
    });
    if (n.count > 0) logger.info({ count: n.count }, "[cron] 3 年前审计日志已清理");
  } catch (err) {
    logger.error({ err }, "[cron] auditLog 清理失败");
  }

  // 2c. Webhook 幂等账本保留 90 天：覆盖 Stripe 常规重试窗口，同时避免无限增长。
  // FAILED 事件不自动删除，必须保留给运营排查与补偿。
  try {
    const n = await prisma.webhookEvent.deleteMany({
      where: {
        status: { in: ["PROCESSED", "IGNORED"] },
        processedAt: { lt: new Date(Date.now() - 90 * 86_400_000) },
      },
    });
    if (n.count > 0) logger.info({ count: n.count }, "[cron] 90 天前 Webhook 幂等记录已清理");
  } catch (err) {
    logger.error({ err }, "[cron] webhookEvent 清理失败");
  }

  // 2d. 邮件 outbox 终态清理：SENT/FAILED 90 天滚动删除（FAILED 保留 lastError
  //     供排查，到 90 天同样回收，与 webhookEvent 的保留窗口一致）。
  try {
    const n = await prisma.mailOutbox.deleteMany({
      where: {
        status: { in: ["SENT", "FAILED"] },
        updatedAt: { lt: new Date(Date.now() - 90 * 86_400_000) },
      },
    });
    if (n.count > 0) logger.info({ count: n.count }, "[cron] 90 天前邮件 outbox 终态记录已清理");
  } catch (err) {
    logger.error({ err }, "[cron] mailOutbox 清理失败");
  }

  // 3. 掉单对账（仅 Stripe 模式有网关状态可查；mock 支付同步完成无此需求）
  // 门控必须覆盖两条收款路径：env Stripe（effectivePaymentMode）**或** 渠道化 Stripe
  // （后台「支付渠道→Stripe」配置密钥收款）。若只看 env 模式，运营在 PAYMENT_MODE=mock/auto
  // 下配置渠道密钥收款时，对账会被跳过——webhook 一旦丢失，钱已收、订单永不 PAID 且无兜底。
  const stripeChannelReady = await (async () => {
    try {
      const channel = await getChannelRuntimeByCode("stripe");
      return !!(channel?.enabled && str(channel.config, "secretKey"));
    } catch {
      /* DB 异常时按未配置处理（回落 env 判断） */
      return false;
    }
  })();
  if (effectivePaymentMode === "stripe" || stripeChannelReady) {
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

  // 3b. 退款 outbox 自动重试：approveRefund 只同步执行一次，此后全靠这里兜底。
  //     扫描条件与 processRefundOutboxItem 的认领条件完全一致（到期 RETRY/PENDING
  //     + 崩溃遗留的过期 PROCESSING 租约），认领失败/异常都不影响本轮其它任务。
  try {
    const started = Date.now();
    const due = await prisma.refundOutbox.findMany({
      where: {
        OR: [
          { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: new Date() } },
          { status: "PROCESSING", claimedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
        ],
      },
      orderBy: { nextAttemptAt: "asc" },
      select: { refundId: true },
      take: REFUND_OUTBOX_BATCH,
    });
    for (const row of due) {
      if (Date.now() - started > REFUND_OUTBOX_BUDGET_MS) {
        logger.warn(
          { batch: due.length },
          "[cron] 退款 outbox 本轮时间预算用尽，剩余下一轮继续（重试幂等，中断安全）",
        );
        break;
      }
      try {
        const result = await processRefundOutboxItem(row.refundId);
        if (result.state === "FAILED") {
          logger.warn(
            { refundId: row.refundId, error: result.error },
            "[cron] 退款 outbox 重试仍失败，等待下一轮",
          );
        }
      } catch (err) {
        logger.error({ err, refundId: row.refundId }, "[cron] 退款 outbox 重试异常");
      }
    }
  } catch (err) {
    logger.error({ err }, "[cron] 退款 outbox 扫描失败");
  }

  // 3c. 邮件 outbox 自动重试（P1：订单确认/发货/退款邮件此前 fire-and-forget，
  //     网关抖动即永久丢信）。queueMail 落库后立即试发一次，此后靠这里退避重试；
  //     网络发送在租约事务外执行（长事务重构后），drain 自带批大小 + 时间预算上界。
  try {
    const n = await drainMailOutbox();
    if (n > 0) logger.info({ count: n }, "[cron] 邮件 outbox 已处理");
  } catch (err) {
    logger.error({ err }, "[cron] 邮件 outbox 扫描失败");
  }

  // 4. 分销对账补偿（隔离模块）：补归属 / 补佣金 / 冲正退款单 / 到期结算。
  //    走 bridge：`DISTRIBUTION_ENABLED=false` 时立即返回，异常也只记录日志。
  //    性能审计修复（降频）：对账是补偿性质（漏网单由 7 天水位窗口兜底），
  //    此前每 60s 心跳跑一轮，稳态下两轮「全表+反连接」扫描纯属浪费 —— 降为
  //    5 分钟一轮，扫描成本降 5 倍且不损失任何补齐时延语义。
  if (Date.now() - lastReconcileAt >= RECONCILE_JOB_INTERVAL_MS) {
    await distributionBridge.runReconcile();
    lastReconcileAt = Date.now();
  }

  // 5. 分销团队业绩日汇总（P2-12，幂等）：把"每次打开报表全表扫描"变成读小表。
  //    性能审计修复（降频）：rollup 的 teamSize 快照天级新鲜度足够，此前却每
  //    60s 心跳都跑（每轮对闭包表全表 groupBy ×2）—— 降为每小时一轮。
  //    幂等可重跑 + rollup 覆盖最近 2 天，漏跑下轮自动补齐。
  if (Date.now() - lastRollupAt >= ROLLUP_JOB_INTERVAL_MS) {
    await distributionBridge.runRollup();
    lastRollupAt = Date.now();
  }
}
