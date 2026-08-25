import "server-only";
import Redis from "ioredis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Redis 客户端(可选)。
 * 未启用/连接失败时返回 null，调用方自动降级到内存实现。
 */
const globalForRedis = globalThis as unknown as { redisClient?: Redis | null };

function createRedis(): Redis | null {
  if (!env.REDIS_ENABLED) return null;
  try {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 500, 3000),
      enableOfflineQueue: false,
    });
    client.on("error", (err) => {
      logger.warn({ err: err.message }, "redis error (降级为内存实现)");
    });
    return client;
  } catch (err) {
    logger.warn({ err }, "redis init failed (降级为内存实现)");
    return null;
  }
}

export function getRedis(): Redis | null {
  if (globalForRedis.redisClient !== undefined) return globalForRedis.redisClient;
  globalForRedis.redisClient = createRedis();
  return globalForRedis.redisClient;
}

export async function redisPing(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  }
}
