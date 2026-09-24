import "server-only";
import { getRedis } from "@/lib/redis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * JSON 缓存封装：Redis 可用时使用 Redis，否则内存 Map(进程级)。
 * 所有商品列表查询缓存 key 统一前缀，便于管理端变更后批量失效。
 */

const PRODUCTS_CACHE_PREFIX = "products:v2:";

type MemoryEntry = { value: unknown; expiresAt: number };

/**
 * 内存缓存挂在 globalThis 上而非模块级常量：
 * Next 会按路由把服务端代码拆成多个 bundle，模块可能被实例化多份，
 * 导致「管理端写入 → invalidateSettingsCache()」清的是 A 实例、页面读的是 B 实例，
 * 改动要等 TTL 过期才可见。挂到 globalThis 保证同进程内共享同一份 Map。
 * （生产启用 Redis 时本就不受影响，这里是让无 Redis 的开发/单机部署也即时生效。）
 */
const globalForCache = globalThis as unknown as { __appMemoryCache?: Map<string, MemoryEntry> };
const memoryStore: Map<string, MemoryEntry> =
  globalForCache.__appMemoryCache ?? new Map<string, MemoryEntry>();
globalForCache.__appMemoryCache = memoryStore;

function memoryGet<T>(key: string): T | null {
  const hit = memoryStore.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return hit.value as T;
}

function memorySet(key: string, value: unknown, ttlSeconds: number) {
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  // 简单防膨胀：超过 1000 条清空
  if (memoryStore.size > 1000) memoryStore.clear();
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      logger.warn({ err, key }, "redis get failed");
    }
  }
  return memoryGet<T>(key);
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = env.CACHE_TTL,
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
      return;
    } catch (err) {
      logger.warn({ err, key }, "redis set failed");
    }
  }
  memorySet(key, value, ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(key);
    } catch (err) {
      logger.warn({ err, key }, "redis del failed");
    }
  }
  memoryStore.delete(key);
}

const PRODUCT_SCAN_COUNT = 200;
const PRODUCT_SCAN_MAX_ITERATIONS = 100;
const PRODUCT_DELETE_BATCH_SIZE = 500;

/** 失效所有商品列表缓存(管理端商品/分类变更后调用)。 */
export async function invalidateProductsCache(): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      let cursor = "0";
      let iterations = 0;
      do {
        iterations += 1;
        const previousCursor = cursor;
        const [nextCursor, keys] = await redis.scan(
          previousCursor,
          "MATCH",
          `${PRODUCTS_CACHE_PREFIX}*`,
          "COUNT",
          PRODUCT_SCAN_COUNT,
        );
        cursor = nextCursor;

        // UNLINK 在后台回收 value，避免大批量 DEL 阻塞 Redis 主线程。
        // 兼容没有 UNLINK 的旧 Redis/代理客户端，失败时回退到 DEL。
        for (let offset = 0; offset < keys.length; offset += PRODUCT_DELETE_BATCH_SIZE) {
          const batch = keys.slice(offset, offset + PRODUCT_DELETE_BATCH_SIZE);
          if (typeof redis.unlink === "function") {
            try {
              await redis.unlink(...batch);
            } catch (err) {
              // UNLINK 是 Redis >=4 的命令；旧服务端/代理不支持时回退 DEL。
              logger.warn(
                { err, batchSize: batch.length },
                "redis unlink failed; falling back to del",
              );
              await redis.del(...batch);
            }
          } else {
            await redis.del(...batch);
          }
        }

        // Redis 文档允许 SCAN 返回空批次；游标异常不动时必须退出，避免误报后无限循环。
        if (nextCursor === previousCursor && keys.length === 0) {
          logger.warn({ cursor }, "redis scan cursor did not advance; stopping cache invalidation");
          break;
        }
      } while (cursor !== "0" && iterations < PRODUCT_SCAN_MAX_ITERATIONS);

      if (cursor !== "0" && iterations >= PRODUCT_SCAN_MAX_ITERATIONS) {
        logger.warn(
          { cursor, iterations },
          "redis product cache invalidation reached scan limit; remaining keys await TTL",
        );
      }
      return;
    } catch (err) {
      // Redis 短暂不可用时仍清理进程内缓存，缓存失效失败不能让商品写入请求失败。
      logger.warn({ err }, "redis scan/unlink failed; falling back to memory cache");
    }
  }
  for (const key of [...memoryStore.keys()]) {
    if (key.startsWith(PRODUCTS_CACHE_PREFIX)) memoryStore.delete(key);
  }
}

/** 商品列表缓存 key 前缀 */
export const productsCacheKey = (suffix: string) => `${PRODUCTS_CACHE_PREFIX}${suffix}`;
