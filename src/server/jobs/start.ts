import { logger } from "@/lib/logger";
import { runScheduledJobs } from "@/server/jobs/scheduler";

/**
 * 进程内定时任务调度器（由 prisma 单例首次初始化时拉起，仅 Node 服务端）。
 * - 每 CRON_INTERVAL_SECONDS(默认 60s) 心跳一次：订单过期取消 / Token 清理 / 掉单对账
 * - 多实例通过 Postgres 咨询锁选主，仅主节点执行
 * - globalThis 标记防 dev HMR 重复注册；定时器 unref，不阻塞进程退出
 */

const globalForCron = globalThis as unknown as { __cronStarted?: boolean };

export function startScheduler(): void {
  if (globalForCron.__cronStarted) return;
  globalForCron.__cronStarted = true;

  const seconds = Number(process.env.CRON_INTERVAL_SECONDS ?? 60);
  const intervalMs = Number.isFinite(seconds) && seconds >= 15 ? seconds * 1000 : 60_000;

  logger.info({ intervalMs }, "[cron] 调度器已启动");
  const timer = setInterval(() => {
    runScheduledJobs().catch((err) => {
      logger.error({ err }, "[cron] 心跳执行失败");
    });
  }, intervalMs);
  timer.unref?.();
}
