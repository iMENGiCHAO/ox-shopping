import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendMail, type MailData, type MailTemplate } from "@/lib/mail";

/**
 * 事务邮件发件队列（P1：订单确认/发货/退款邮件此前 `void sendMail(...)` fire-and-forget，
 * Resend/SMTP 抖动即永久丢信——无重试、无兜底、无告警，只有到货提醒有自己的 draft 队列）。
 *
 * 语义：at-least-once。
 *  - `queueMail` 先落库（PENDING）再立即试发一次：即便进程在发送前崩溃，行仍在
 *    队列里，下一轮 cron 心跳会接走（同退款 outbox 的取舍）。
 *  - 立即试发成功置 SENT；失败按指数退避由 scheduler 重试，到 maxAttempts 置
 *    FAILED 终态并保留 lastError 供排查。
 *  - 可能的重复：立即试发其实已送达、但进程在写回 SENT 前崩溃 → 下一轮重发一次。
 *    订单邮件重复一封远好于丢失。
 *  - console 通道 `delivered=false` 同样进重试（与到货提醒 draft 的判定一致：
 *    落盘 ≠ 送达）；生产 env 守卫保证 MAIL_PROVIDER 是 resend/smtp。
 *
 * 重放保真：`data` 原样落库（JSON），siteUrl/siteName/品牌名由 sendMail 渲染时
 * 注入 —— 后台改品牌配置后，重试的邮件用新配置，而非旧快照。
 */

/** 崩溃遗留的 PROCESSING 租约超过此时长即可被抢占（与退款 outbox 一致） */
const STALE_CLAIM_MS = 5 * 60_000;

/** 指数退避：attempts=1 → 2min，2 → 4min，… 封顶 6h。8 次累计约 2 小时。 */
function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 60_000, 6 * 3_600_000);
}

export interface QueueMailResult {
  /** true = 已进入持久队列（后续失败也有重试兜底） */
  queued: boolean;
  outboxId?: string;
  /** 本次立即试发是否送达（false 不代表丢信——queued=true 时由重试兜底） */
  delivered: boolean;
}

/**
 * 可靠发信入口：落库 → 立即试发一次 → 失败交给 cron 退避重试。
 * 与旧 `sendMail` 一样**永不抛异常**（调用方安全地 `void queueMail(...)`）。
 */
export async function queueMail<T extends MailTemplate>(
  input: { to: string; template: T; data: MailData[T] },
): Promise<QueueMailResult> {
  let outboxId: string;
  try {
    const row = await prisma.mailOutbox.create({
      data: {
        to: input.to,
        template: input.template,
        data: input.data as object,
        status: "PENDING",
        nextAttemptAt: new Date(),
      },
      select: { id: true },
    });
    outboxId = row.id;
  } catch (err) {
    // 落库失败（DB 故障）：退回旧语义直接试发一次 —— 队列绝不能反过来阻断主流程
    logger.error({ err, template: input.template }, "[mail-outbox] 落库失败，退化为直发");
    const result = await sendMail(input);
    return { queued: false, delivered: result.delivered };
  }

  try {
    const result = await processMailOutboxItem(outboxId);
    return { queued: true, outboxId, delivered: result.delivered };
  } catch (err) {
    // 行留在 PROCESSING：崩溃租约由 cron 的过期抢占自愈，不在此处强行回写
    logger.error({ err, outboxId }, "[mail-outbox] 立即试发异常，等待 cron 过期抢占重试");
    return { queued: true, outboxId, delivered: false };
  }
}

export interface MailOutboxExecutionResult {
  state: "SUCCEEDED" | "RETRY" | "FAILED";
  delivered: boolean;
  error?: string;
}

/**
 * 认领并执行一条发件任务（立即试发与 cron 重试共用）。
 * 认领条件与退款 outbox 一致：到期 PENDING + 崩溃遗留的过期 PROCESSING 租约；
 * 认领即原子（updateMany 条件更新），多实例并发下同一条只会被一个执行者抢到。
 */
export async function processMailOutboxItem(id: string): Promise<MailOutboxExecutionResult> {
  const now = new Date();
  const stale = new Date(now.getTime() - STALE_CLAIM_MS);
  const claimed = await prisma.mailOutbox.updateMany({
    where: {
      id,
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: now } },
        { status: "PROCESSING", claimedAt: { lt: stale } },
      ],
    },
    data: { status: "PROCESSING", claimedAt: now, attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    const current = await prisma.mailOutbox.findUnique({ where: { id }, select: { status: true } });
    if (current?.status === "SENT") return { state: "SUCCEEDED", delivered: true };
    if (current?.status === "FAILED") return { state: "FAILED", delivered: false };
    return { state: "RETRY", delivered: false };
  }

  const row = await prisma.mailOutbox.findUniqueOrThrow({ where: { id } });
  const result = await sendMail({
    to: row.to,
    template: row.template as MailTemplate,
    data: row.data as never,
  });

  if (result.delivered) {
    await prisma.mailOutbox.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), claimedAt: null, lastError: null },
    });
    return { state: "SUCCEEDED", delivered: true };
  }

  // console 通道无 error 字段，也记录可读原因，避免 lastError 为空难排查
  const error = result.error ?? `channel=${result.channel} 未送达`;
  if (row.attempts >= row.maxAttempts) {
    await prisma.mailOutbox.update({
      where: { id },
      data: { status: "FAILED", claimedAt: null, lastError: error },
    });
    return { state: "FAILED", delivered: false, error };
  }
  await prisma.mailOutbox.update({
    where: { id },
    data: {
      status: "PENDING",
      claimedAt: null,
      nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts)),
      lastError: error,
    },
  });
  return { state: "RETRY", delivered: false, error };
}

/**
 * cron 心跳入口：扫描所有到期项并逐条执行。
 * 邮件发送是**网络 I/O**（发生在持锁事务内，同 Stripe 对账的已知取舍），
 * 因此批大小 + 时间预算双上界保证事务时长有界；预算用尽即中断，重试幂等、
 * 中断安全，剩余项下一轮心跳继续。
 */
export async function drainMailOutbox(batch = 20, budgetMs = 60_000): Promise<number> {
  const started = Date.now();
  const due = await prisma.mailOutbox.findMany({
    where: {
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: new Date() } },
        { status: "PROCESSING", claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    select: { id: true },
    take: batch,
  });

  let processed = 0;
  for (const row of due) {
    if (Date.now() - started > budgetMs) break;
    try {
      const result = await processMailOutboxItem(row.id);
      processed += 1;
      if (result.state === "FAILED") {
        logger.warn({ id: row.id, error: result.error }, "[mail-outbox] 重试到限，置 FAILED 终态");
      }
    } catch (err) {
      logger.error({ err, id: row.id }, "[mail-outbox] 处理异常，保留租约待过期抢占");
    }
  }
  return processed;
}
