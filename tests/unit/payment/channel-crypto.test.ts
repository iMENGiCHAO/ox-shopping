import { describe, expect, it } from "vitest";
import { encryptConfig, decryptConfig } from "@/lib/payment/channel-crypto-core";

describe("支付渠道配置加密（AES-256-GCM）", () => {
  const key = "test-payment-channel-enc-key";

  it("加密后可正确解密还原", () => {
    const config = { appId: "2021000000000000", privateKey: "-----BEGIN ... secret ... END-----" };
    const blob = encryptConfig(key, config);
    // 密文不应包含明文密钥
    expect(blob).not.toContain("secret");
    expect(decryptConfig(key, blob)).toEqual(config);
  });

  it("每次加密使用随机 IV（密文不重复）", () => {
    const a = encryptConfig(key, { x: "1" });
    const b = encryptConfig(key, { x: "1" });
    expect(a).not.toBe(b);
    expect(decryptConfig(key, a)).toEqual(decryptConfig(key, b));
  });

  it("错误密钥无法解密（GCM 认证失败）", () => {
    const blob = encryptConfig(key, { x: "1" });
    expect(() => decryptConfig("wrong-key", blob)).toThrow();
  });

  it("空对象也可加解密", () => {
    const blob = encryptConfig(key, {});
    expect(decryptConfig(key, blob)).toEqual({});
  });
});