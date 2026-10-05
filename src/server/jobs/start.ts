import { logger } from "@/lib/logger";

/**
 * 进程内定时任务调度器（由 prisma 单例首次初始化时拉起，仅 Node 服务端）。
 * - 每 CRON_INTERVAL_SECONDS(默认 60s) 心跳一次：订单过期取消 / Token 清理 / 掉单对账
 * - 多实例通过 Postgres 咨询锁选主，仅主节点执行
 * - globalThis 标记防 dev HMR 重复注册；定时器 unref，不阻塞进程退出
 */

const globalForCron = globalThis as unknown as { __cronStarted?: boolean };

export function startScheduler(): void {
  if (globalForCron.__cronStarted) return;
  // CRON_ENABLED=false 完全关闭（交付审计：该变量此前全仓无读取方 = 死开关，
  // 文档承诺的「维护/迁移窗口可关闭」不成立，订单超时/对账/结算仍照跑写库）。
  if (process.env.CRON_ENABLED === "false") {
    globalForCron.__cronStarted = true;
    logger.warn(
      "[cron] CRON_ENABLED=false —— 调度器未启动：订单超时取消 / 掉单对账 / 分销结算均不会自动执行",
    );
    return;
  }
  globalForCron.__cronStarted = true;

  const seconds = Number(process.env.CRON_INTERVAL_SECONDS ?? 60);
  const intervalMs = Number.isFinite(seconds) && seconds >= 15 ? seconds * 1000 : 60_000;

  logger.info({ intervalMs }, "[cron] 调度器已启动");
  const timer = setInterval(() => {
    /**
     * 心跳里**重新 import**，而不是在注册时静态捕获 `runScheduledJobs`。
     *
     * 原因：`__cronStarted` 守卫是「只注册一次」，而它保护的定时器比模块实例活得久。
     * 一旦模块实例被替换（dev HMR 重载 `scheduler.ts`、或测试环境按文件重建模块图），
     * 旧定时器持有的仍是**上一个实例**的导出，于是每一跳都抛
     * `runScheduledJobs is not a function` —— 且因为守卫拦着不会重注册，
     * **定时任务就永久静默失效了**（订单超时取消、Token 清理、掉单对账全部停摆）。
     *
     * 每次心跳重新解析模块即可始终拿到当前实例。频率是 60s 一次，
     * 动态 import 走模块缓存，代价可忽略。
     */
    void import("@/server/jobs/scheduler")
      .then((m) => m.runScheduledJobs())
      .catch((err) => {
        logger.error({ err }, "[cron] 心跳执行失败");
      });
  }, intervalMs);
  timer.unref?.();
}
