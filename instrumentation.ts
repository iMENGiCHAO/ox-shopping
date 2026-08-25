/**
 * Next.js instrumentation 钩子：服务进程启动时执行一次。
 * 仅在 nodejs 运行时启动后台调度器（edge 运行时无文件系统/长连接能力）。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.CRON_ENABLED === "false") return;
  const { startScheduler } = await import("@/server/jobs/start");
  startScheduler();
}
