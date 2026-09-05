import { describe, expect, it } from "vitest";
import { randomNonce, buildCsp } from "@/lib/server/proxy-helpers";

/** P1-2：CSP nonce 熵 + CSP 结构纯函数单元测试 */

describe("randomNonce", () => {
  it("生成 128 位 base64 nonce（22 字符无换行）", () => {
    const n = randomNonce();
    // 16 字节 → base64 固定 22 字符（含 1 个 = 填充）或 24 字符；这里只需断言长度合理且无换行
    expect(n.length).toBeGreaterThanOrEqual(22);
    expect(n.length).toBeLessThanOrEqual(24);
    expect(n).not.toMatch(/[\r\n]/);
  });

  it("多次生成互不相同（非固定值）", () => {
    const set = new Set(Array.from({ length: 100 }, () => randomNonce()));
    expect(set.size).toBe(100);
  });
});

describe("buildCsp", () => {
  it("生产：含 nonce + strict-dynamic + frame-ancestors", () => {
    const csp = buildCsp("abc123+/=", true);
    expect(csp).toContain("'nonce-abc123+/='");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("开发：宽松策略，无 nonce/无 frame-ancestors，含 unsafe-eval 与 localhost", () => {
    const csp = buildCsp("", false);
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("localhost:*");
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("strict-dynamic");
    expect(csp).not.toContain("frame-ancestors");
  });
});