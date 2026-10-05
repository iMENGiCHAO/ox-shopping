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

// 进程内定时任务启动：已收敛到 src/instrumentation.ts 的 register()（服务器
// 启动即拉起，含 Sentry 初始化）—— 此前的「import prisma 单例 = 起定时任务」
// 隐式副作用已移除（解耦审计：数据库客户端不应携带定时任务副作用；
// 顺序无关，startScheduler 的 globalThis 守卫保证与任何旧路径共存幂等）。
