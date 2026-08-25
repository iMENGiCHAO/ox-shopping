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
