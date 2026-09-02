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
