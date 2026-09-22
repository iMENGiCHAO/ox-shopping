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
  /**
   * 可选「全站熔断」：端点级共享 key（**不含 IP/用户标识**）与该窗口内的全站总量上限。
   *
   * 为什么需要：按 IP/指纹的单桶限额在标识可伪造时能被轮换绕过（伪造 XFF、换 UA）。
   * 熔断额度与标识无关，兜底保护后端不被打穿；正常流量远低于该额度（通常取单桶 limit 的
   * 50–100 倍），只有攻击/异常时才触发。
   */
  breakerKey?: string;
  breakerLimit?: number;
  /** 熔断窗口（秒）；缺省与 windowSeconds 相同。可与单桶窗口不同（如单桶 60s、熔断 3600s） */
  breakerWindowSeconds?: number;
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

/** 单桶计数（Redis 原子优先，失败降级进程内 LRU） */
async function hitBucket(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const redis = getRedis();
  if (redis) {
    try {
      const redisKey = `ratelimit:${key}`;
      const [count, ttl] = (await redis.eval(REDIS_SCRIPT, 1, redisKey, windowSeconds)) as [
        number,
        number,
      ];
      return {
        ok: count <= limit,
        remaining: Math.max(limit - count, 0),
        retryAfterSeconds: count > limit ? Math.max(ttl, 1) : 0,
      };
    } catch (err) {
      logger.warn({ err }, "redis rate limit failed, fallback to memory");
    }
  }
  return memoryBuckets.hit(key, limit, windowSeconds);
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

  const local = await hitBucket(opts.key, opts.limit, opts.windowSeconds);
  // 单桶已超限：直接拒绝，且**不计入**熔断桶。
  // 这个顺序很关键：否则单个 IP 打满自己的桶就能把全站熔断桶打爆，
  // 等于给攻击者一个「一个 IP 锁死整个端点」的武器。
  if (!local.ok) return local;

  // 全站熔断：与客户端标识无关的总量上限（防标识轮换绕过单桶限额）。
  // 只有「通过单桶检查」的请求才计数 —— 轮换 IP/UA 的攻击者每发必中，必然触发；
  // 而被单桶拦住的重复请求不会污染熔断额度。
  if (opts.breakerKey && opts.breakerLimit && opts.breakerLimit > 0) {
    const breaker = await hitBucket(
      opts.breakerKey,
      opts.breakerLimit,
      opts.breakerWindowSeconds ?? opts.windowSeconds,
    );
    if (!breaker.ok) {
      logger.warn(
        { key: opts.key, breakerKey: opts.breakerKey, breakerLimit: opts.breakerLimit },
        "全站熔断触发：端点请求总量超限（疑似标识轮换绕过限流）",
      );
      return {
        ok: false,
        remaining: 0,
        retryAfterSeconds: Math.max(breaker.retryAfterSeconds, 1),
      };
    }
  }

  return local;
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
