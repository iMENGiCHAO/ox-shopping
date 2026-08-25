import "server-only";
import { PrismaClient } from "@prisma/client";
import { isProduction } from "@/lib/env";

/**
 * Prisma 单例客户端(避免开发环境热重载产生过多连接)。
 * 生产环境 query log 关闭；开发环境按需开启。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ["warn", "error"] : ["warn", "error"],
  });

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

// 进程内定时任务（订单过期取消 / Token 清理 / 掉单对账）。
// 挂在 prisma 单例上：本模块只会在 Node 服务端被导入，天然不进 edge 打包图；
// startScheduler 内部有 globalThis 守卫，每进程仅启动一次。CRON_ENABLED=false 可关闭。
if (process.env.NEXT_RUNTIME !== "edge" && process.env.CRON_ENABLED !== "false") {
  void import("@/server/jobs/start")
    .then((m) => m.startScheduler())
    .catch(() => {});
}
