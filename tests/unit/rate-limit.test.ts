import { describe, expect, it, beforeEach } from "vitest";
import { compositeKey, rateLimit, resetRateLimit } from "@/lib/rate-limit";

describe("rateLimit 内存 LRU 实现", () => {
  beforeEach(async () => {
    // 复位所有 key
    await resetRateLimit("test:key:1");
    await resetRateLimit("test:key:2");
  });

  it("首次命中 ok=true，remaining = limit - 1", async () => {
    const r = await rateLimit({ key: "test:key:1", limit: 3, windowSeconds: 60 });
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(2);
    expect(r.retryAfterSeconds).toBe(0);
  });

  it("超出 limit 返回 ok=false + retryAfterSeconds > 0", async () => {
    await rateLimit({ key: "test:key:1", limit: 2, windowSeconds: 60 });
    await rateLimit({ key: "test:key:1", limit: 2, windowSeconds: 60 });
    const r = await rateLimit({ key: "test:key:1", limit: 2, windowSeconds: 60 });
    expect(r.ok).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("不同 key 独立计数", async () => {
    const a1 = await rateLimit({ key: "test:key:1", limit: 1, windowSeconds: 60 });
    const a2 = await rateLimit({ key: "test:key:1", limit: 1, windowSeconds: 60 });
    const b1 = await rateLimit({ key: "test:key:2", limit: 1, windowSeconds: 60 });
    expect(a1.ok).toBe(true);
    expect(a2.ok).toBe(false);
    expect(b1.ok).toBe(true);
  });

  it("resetRateLimit 清除状态", async () => {
    await rateLimit({ key: "test:key:1", limit: 1, windowSeconds: 60 });
    await rateLimit({ key: "test:key:1", limit: 1, windowSeconds: 60 });
    expect((await rateLimit({ key: "test:key:1", limit: 1, windowSeconds: 60 })).ok).toBe(false);
    await resetRateLimit("test:key:1");
    expect((await rateLimit({ key: "test:key:1", limit: 1, windowSeconds: 60 })).ok).toBe(true);
  });
});

describe("compositeKey", () => {
  it("拼接多个维度并过滤空值", () => {
    expect(compositeKey("login", "user@example.com", "1.2.3.4")).toBe("login|user@example.com|1.2.3.4");
  });

  it("过滤 undefined / null / 空字符串", () => {
    expect(compositeKey("a", undefined, "b", null, "", "c")).toBe("a|b|c");
  });

  it("替换 | : 等分隔符以避免伪造", () => {
    expect(compositeKey("a", "b|c:d", "e")).toBe("a|b_c_d|e");
  });
});

/**
 * 全站熔断（B1 修复的兜底能力）：
 * 单桶按标识（IP/指纹）计数，标识可被轮换绕过；熔断额度与标识无关。
 * 关键语义：**只有通过单桶检查的请求才计入熔断** —— 否则单个 IP 打满自己的桶
 * 就能把全站熔断桶打爆，等于给攻击者一个「一个 IP 锁死整个端点」的武器。
 */
describe("全站熔断 breakerKey/breakerLimit", () => {
  const locals = ["brk:a", "brk:b", "brk:c", "brk:d", "brk:local:1", "brk:local:2"];
  const breaker = "brk:__global__";
  beforeEach(async () => {
    for (const k of [...locals, breaker]) await resetRateLimit(k);
  });

  it("标识轮换攻击：每个请求都过单桶，熔断额度打满后一律 429", async () => {
    const opts = (key: string) => ({
      key,
      limit: 1,
      windowSeconds: 60,
      breakerKey: breaker,
      breakerLimit: 3,
    });
    expect((await rateLimit(opts("brk:a"))).ok).toBe(true);
    expect((await rateLimit(opts("brk:b"))).ok).toBe(true);
    expect((await rateLimit(opts("brk:c"))).ok).toBe(true);
    // 第 4 个标识：单桶从未用过（本地必过），但全站额度已满 → 熔断拒绝
    const blocked = await rateLimit(opts("brk:d"));
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("被单桶拒绝的重复请求不消耗熔断额度（单个 IP 无法锁死端点）", async () => {
    const opts = (key: string) => ({
      key,
      limit: 1,
      windowSeconds: 60,
      breakerKey: breaker,
      breakerLimit: 2,
    });
    // 同一标识狂刷：只有第 1 次通过单桶（消耗 1 个熔断额度），后续都被单桶挡下
    expect((await rateLimit(opts("brk:local:1"))).ok).toBe(true);
    expect((await rateLimit(opts("brk:local:1"))).ok).toBe(false);
    expect((await rateLimit(opts("brk:local:1"))).ok).toBe(false);
    // 另一标识的首个请求必须仍被放行（证明被拒请求没有污染熔断桶）
    expect((await rateLimit(opts("brk:local:2"))).ok).toBe(true);
    // 熔断桶此时刚到额度（2），下一个新标识的新请求才会被熔断拦下
    expect((await rateLimit(opts("brk:a"))).ok).toBe(false);
  });

  it("未配置 breaker 时行为与原来完全一致", async () => {
    const r1 = await rateLimit({ key: "brk:a", limit: 1, windowSeconds: 60 });
    const r2 = await rateLimit({ key: "brk:a", limit: 1, windowSeconds: 60 });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
  });

  it("熔断窗口可独立于单桶窗口", async () => {
    // 单桶 60s、熔断 3600s：额度 1，第二个标识即被熔断
    const opts = (key: string) => ({
      key,
      limit: 1,
      windowSeconds: 60,
      breakerKey: breaker,
      breakerLimit: 1,
      breakerWindowSeconds: 3600,
    });
    expect((await rateLimit(opts("brk:a"))).ok).toBe(true);
    expect((await rateLimit(opts("brk:b"))).ok).toBe(false);
  });
});
