import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { clientFingerprint, getClientIp } from "@/lib/server/utils-server";

/**
 * B1（限流塌缩）回归测试。
 *
 * 旧实现：`TRUST_PROXY=false` 或无转发头时一律返回 `"unknown"` ——
 * 全体客户端共享同一个限流桶（注册 3/min、下单 5/10min 全站塌缩），
 * 一个攻击者打满额度即可让所有正常用户无法注册/下单，审计日志也无法追溯。
 *
 * 现行为：退化为「请求头指纹」——同一客户端稳定、不同客户端可区分，绝不返回单一常量。
 */

const H = (extra: Record<string, string> = {}) =>
  new Request("https://example.test/api/x", { headers: extra });

describe("getClientIp / clientFingerprint（B1 修复）", () => {
  const original = env.TRUST_PROXY;
  afterEach(() => {
    env.TRUST_PROXY = original;
  });

  it("绝不返回单一常量 unknown：不同客户端拿到不同桶", () => {
    env.TRUST_PROXY = false;
    const a = getClientIp(H({ "user-agent": "UA-A", "accept-language": "en" }));
    const b = getClientIp(H({ "user-agent": "UA-B", "accept-language": "zh-CN" }));
    expect(a).not.toBe("unknown");
    expect(b).not.toBe("unknown");
    expect(a).not.toBe(b);
  });

  it("同一客户端指纹跨请求稳定（限流才能累计）", () => {
    env.TRUST_PROXY = false;
    const headers = {
      "user-agent": "UA-A",
      "accept-language": "en",
      "sec-ch-ua": '"Chromium";v="120"',
    };
    expect(getClientIp(H(headers))).toBe(getClientIp(H(headers)));
  });

  it("TRUST_PROXY=false 时不信任可伪造的转发头", () => {
    env.TRUST_PROXY = false;
    const ip = getClientIp(H({ "x-forwarded-for": "1.2.3.4", "user-agent": "UA-A" }));
    expect(ip).not.toBe("1.2.3.4");
    expect(ip.startsWith("anon:")).toBe(true);
  });

  it("TRUST_PROXY=true 时取 XFF 最后一跳（可信反代追加的那一跳）", () => {
    env.TRUST_PROXY = true;
    // 前缀条目是客户端伪造的，必须忽略；最后一跳才是可信代理写入的真实来源
    expect(getClientIp(H({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("10.0.0.1");
    expect(getClientIp(H({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
  });

  it("无任何请求头时给出显式匿名桶（不静默混入正常客户端）", () => {
    env.TRUST_PROXY = false;
    expect(clientFingerprint(H())).toBe("anon:no-headers");
  });

  it("指纹是短哈希，不落原始 UA（避免 UA 进 Redis key / 日志）", () => {
    const fp = clientFingerprint(H({ "user-agent": "Secret-UA/1.0" }));
    expect(fp.startsWith("anon:")).toBe(true);
    expect(fp).not.toContain("Secret-UA");
    expect(fp.length).toBeLessThan(32);
  });
});
