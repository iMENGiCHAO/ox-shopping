import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  scan: vi.fn(),
  unlink: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => redisMock,
}));

import { cacheGet, cacheSet, invalidateProductsCache, productsCacheKey } from "@/lib/cache";

describe("商品缓存 Redis SCAN 失效", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.get.mockReset();
    redisMock.set.mockReset();
    redisMock.scan.mockReset();
    redisMock.unlink.mockReset();
    redisMock.del.mockReset();
    redisMock.scan.mockResolvedValue(["0", []]);
    redisMock.unlink.mockResolvedValue(0);
    redisMock.del.mockResolvedValue(0);
    redisMock.get.mockRejectedValue(new Error("redis unavailable"));
  });

  it("分页 SCAN，并按批次 UNLINK，不调用 KEYS", async () => {
    redisMock.scan
      .mockResolvedValueOnce(["2", ["products:v2:a", "products:v2:b"]])
      .mockResolvedValueOnce(["0", ["products:v2:c"]]);

    await invalidateProductsCache();

    expect(redisMock.scan).toHaveBeenNthCalledWith(1, "0", "MATCH", "products:v2:*", "COUNT", 200);
    expect(redisMock.scan).toHaveBeenNthCalledWith(2, "2", "MATCH", "products:v2:*", "COUNT", 200);
    expect(redisMock.unlink).toHaveBeenNthCalledWith(1, "products:v2:a", "products:v2:b");
    expect(redisMock.unlink).toHaveBeenNthCalledWith(2, "products:v2:c");
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it("UNLINK 不受支持时回退 DEL", async () => {
    redisMock.scan.mockResolvedValueOnce(["0", ["products:v2:legacy"]]);
    redisMock.unlink.mockRejectedValueOnce(new Error("unknown command UNLINK"));
    redisMock.del.mockResolvedValueOnce(1);

    await invalidateProductsCache();

    expect(redisMock.unlink).toHaveBeenCalledWith("products:v2:legacy");
    expect(redisMock.del).toHaveBeenCalledWith("products:v2:legacy");
  });

  it("限制 SCAN 循环次数，异常游标不会无限扫描", async () => {
    redisMock.scan.mockImplementation(async (cursor: string) => [String(Number(cursor) + 1), []]);

    await invalidateProductsCache();

    expect(redisMock.scan).toHaveBeenCalledTimes(100);
  });

  it("Redis 故障时安全降级，仍清理内存商品缓存", async () => {
    redisMock.scan.mockRejectedValue(new Error("redis unavailable"));
    redisMock.set.mockRejectedValue(new Error("redis unavailable"));
    await cacheSet(productsCacheKey("fallback"), { stale: true });
    // cacheSet 走 Redis mock；让它失败以验证写入也会回退到内存。
    redisMock.scan.mockRejectedValue(new Error("redis unavailable"));
    redisMock.unlink.mockRejectedValue(new Error("redis unavailable"));

    await expect(invalidateProductsCache()).resolves.toBeUndefined();
    await expect(cacheGet(productsCacheKey("fallback"))).resolves.toBeNull();
    expect(redisMock.del).not.toHaveBeenCalled();
  });
});
