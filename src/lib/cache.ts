import "server-only";
import { getRedis } from "@/lib/redis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * JSON 缓存封装：Redis 可用时使用 Redis，否则内存 Map(进程级)。
 * 所有商品列表查询缓存 key 统一前缀，便于管理端变更后批量失效。
 */

const PRODUCTS_CACHE_PREFIX = "{m.group(1)}v2";

const memoryStore = new Map<string, { value: unknown; expiresAt: number }>();

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

/** 失效所有商品列表缓存(管理端商品/分类变更后调用) */
export async function invalidateProductsCache(): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys(`${PRODUCTS_CACHE_PREFIX}*`);
      if (keys.length > 0) await redis.del(...keys);
      return;
    } catch (err) {
      logger.warn({ err }, "redis keys/del failed");
    }
  }
  for (const key of [...memoryStore.keys()]) {
    if (key.startsWith(PRODUCTS_CACHE_PREFIX)) memoryStore.delete(key);
  }
}

/** 商品列表缓存 key 前缀 */
export const productsCacheKey = (suffix: string) => `${PRODUCTS_CACHE_PREFIX}${suffix}`;
