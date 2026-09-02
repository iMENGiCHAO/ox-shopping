import "server-only";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * 限流器：固定窗口计数。
 * Redis 可用时使用 Redis(多实例共享) + Lua 脚本保证 INCR/EXPIRE 原子；
 * 进程内 fallback 走 LRU 淘汰（避免旧实现的 clear() 绕过限流）。
 */

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

/* ───────────────────────── 进程内 LRU 限流 ───────────────────────── */

class LruCounter {
  private map = new Map<string, { count: number; windowStart: number }>();
  constructor(private readonly maxEntries: number) {}

  hit(key: string, limit: number, windowSeconds: number): RateLimitResult {
    const now = Math.floor(Date.now() / 1000);
    const cur = this.map.get(key);
    if (!cur || cur.windowStart + windowSeconds <= now) {
      this.write(key, { count: 1, windowStart: now });
      this.evict();
      return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }
    cur.count += 1;
    this.write(key, cur); // 刷新 LRU 顺序
    return {
      ok: cur.count <= limit,
      remaining: Math.max(limit - cur.count, 0),
      retryAfterSeconds: cur.count > limit ? cur.windowStart + windowSeconds - now : 0,
    };
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  size(): number {
    return this.map.size;
  }

  private write(key: string, value: { count: number; windowStart: number }) {
    this.map.set(key, value);
  }

  /** 超出容量时按 LRU（最久未命中）淘汰 */
  private evict() {
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}

const memoryBuckets = new LruCounter(10_000);

/* ───────────────────────── Redis 限流 ───────────────────────── */

// 原子 INCR + EXPIRE 的 Lua 脚本（仅在 EXPIRE 缺失时设置，避免覆盖）
const REDIS_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {n, ttl}
`;

/* ───────────────────────── 公共 API ───────────────────────── */

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
  const { key, limit: l, windowSeconds: w } = opts;

  const redis = getRedis();
  if (redis) {
    try {
      const redisKey = `ratelimit:${key}`;
      const [count, ttl] = (await redis.eval(REDIS_SCRIPT, 1, redisKey, w)) as [number, number];
      return {
        ok: count <= l,
        remaining: Math.max(l - count, 0),
        retryAfterSeconds: count > l ? Math.max(ttl, 1) : 0,
      };
    } catch (err) {
      logger.warn({ err }, "redis rate limit failed, fallback to memory");
    }
  }

  return memoryBuckets.hit(key, l, w);
}

/** 重置限流计数（如登录成功后清除失败锁定计数） */
export async function resetRateLimit(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(`ratelimit:${key}`);
    } catch {
      /* 忽略 */
    }
  }
  memoryBuckets.delete(key);
}

/* ───────────────────────── 复合 key 助手 ───────────────────────── */

/**
 * 复合限流 key：把多个维度（email / ip / 端点）拼成一个 key。
 * 用于"按 email 限流 + 按 ip 限流"等组合策略，避免单维度被利用。
 */
export function compositeKey(...parts: Array<string | number | undefined | null>): string {
  return parts
    .filter((p) => p !== undefined && p !== null && String(p).length > 0)
    .map((p) => String(p).replace(/[|:]/g, "_"))
    .join("|");
}
