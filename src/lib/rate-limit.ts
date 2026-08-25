import "server-only";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * 限流器：固定窗口计数。
 * Redis 可用时使用 Redis(多实例共享)；否则进程内存(单实例够用)。
 */

const memoryBuckets = new Map<string, { count: number; windowStart: number }>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

/** 限流(兼容两种调用形式：rateLimit(key, limit, window) 或 rateLimit({key, limit, windowSeconds})) */
export async function rateLimit(
  keyOrOptions: string | RateLimitOptions,
  limit?: number,
  windowSeconds?: number,
): Promise<RateLimitResult> {
  const opts: RateLimitOptions =
    typeof keyOrOptions === "string"
      ? { key: keyOrOptions, limit: limit ?? 60, windowSeconds: windowSeconds ?? 60 }
      : keyOrOptions;
  const { key } = opts;
  const redisLimit = opts.limit;
  const redisWindow = opts.windowSeconds;

  const redis = getRedis();
  if (redis) {
    try {
      const redisKey = `ratelimit:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, redisWindow);
      }
      const ttl = Math.max((await redis.ttl(redisKey)) ?? redisWindow, 1);
      return {
        ok: count <= redisLimit,
        remaining: Math.max(redisLimit - count, 0),
        retryAfterSeconds: count > redisLimit ? ttl : 0,
      };
    } catch (err) {
      logger.warn({ err }, "redis rate limit failed, fallback to memory");
    }
  }

  // 内存实现
  const now = Math.floor(Date.now() / 1000);
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.windowStart + redisWindow <= now) {
    memoryBuckets.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: redisLimit - 1, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (memoryBuckets.size > 10000) memoryBuckets.clear();
  return {
    ok: bucket.count <= redisLimit,
    remaining: Math.max(redisLimit - bucket.count, 0),
    retryAfterSeconds: bucket.count > redisLimit ? bucket.windowStart + redisWindow - now : 0,
  };
}
