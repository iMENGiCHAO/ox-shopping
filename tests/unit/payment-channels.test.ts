import { describe, expect, it } from "vitest";
import { PROVIDERS, CHANNEL_META, getProvider } from "@/lib/payment/providers";
import { validateChannelConfig } from "@/lib/validations/payment-channel";

/** 与 channel.service 一致的 ready 判据：isReady 缺省 = isConfigured */
function isReadyFor(key: string, config: Record<string, unknown>): boolean {
  const p = getProvider(key);
  return p.isReady ? p.isReady(config) : p.isConfigured(config);
}

describe("支付渠道注册表（预留完整性与三态语义）", () => {
  it("注册表包含全部 6 个内置渠道（mock/alipay/wechat/bankcard/stripe/paypal）", () => {
    expect(CHANNEL_META.map((m) => m.code)).toEqual([
      "mock",
      "alipay",
      "wechat",
      "bankcard",
      "stripe",
      "paypal",
    ]);
    // 每个 code 都有对应实现
    for (const m of CHANNEL_META) {
      expect(PROVIDERS[m.provider]).toBeDefined();
    }
  });

  it("每个渠道都有一句话说明（后台列表展示用）", () => {
    for (const m of CHANNEL_META) {
      expect(m.description.length).toBeGreaterThan(4);
    }
  });

  it("mock：免配置即可用、可收款（开发流程不被预留语义挡住）", () => {
    expect(getProvider("mock").isConfigured({})).toBe(true);
    expect(isReadyFor("mock", {})).toBe(true);
  });

  it("预留级渠道（alipay/wechat/bankcard/paypal）：配置齐全 isReady 仍为 false（前台置灰）", () => {
    const cases: [string, Record<string, unknown>][] = [
      ["alipay", { appId: "2021000", privateKey: "-----BEGIN", alipayPublicKey: "-----BEGIN" }],
      [
        "wechat",
        {
          mchId: "1234567890",
          apiV3Key: "x".repeat(32),
          serialNo: "SN",
          merchantPrivateKey: "-----BEGIN",
        },
      ],
      [
        "bankcard",
        { gatewayUrl: "https://gw.example.com/pay", merchantId: "m1234", secretKey: "s" },
      ],
      ["paypal", { clientId: "cid", clientSecret: "sec" }],
    ];
    for (const [key, config] of cases) {
      const p = getProvider(key);
      expect(p.isConfigured(config), key).toBe(true);
      expect(isReadyFor(key, config), key).toBe(false);
    }
  });

  it("预留级渠道：未配置时 isConfigured=false（启用门控会拦截）", () => {
    for (const key of ["alipay", "wechat", "bankcard", "paypal", "stripe"]) {
      expect(getProvider(key).isConfigured({}), key).toBe(false);
    }
  });

  it("stripe（渠道化真实接入）：secretKey 即配置；ready 需 secretKey + webhookSecret", () => {
    const p = getProvider("stripe");
    expect(p.isConfigured({ secretKey: "sk_live_x" })).toBe(true);
    // 缺 webhookSecret：下单可用但支付确认只能靠定时对账 → 不可收款
    expect(isReadyFor("stripe", { secretKey: "sk_live_x" })).toBe(false);
    expect(isReadyFor("stripe", { secretKey: "sk_live_x", webhookSecret: "whsec_y" })).toBe(true);
  });
});

describe("渠道配置格式校验（validateChannelConfig）", () => {
  it("stripe 密钥前缀校验 + 掩码跳过", () => {
    expect(validateChannelConfig("stripe", { secretKey: "bad-key" })).toContain(
      "Secret Key 需以 sk_test_ 或 sk_live_ 开头",
    );
    expect(
      validateChannelConfig("stripe", { secretKey: "sk_test_ok", webhookSecret: "whsec_ok" }),
    ).toEqual([]);
    // 已脱敏值 = 保留旧值，跳过校验
    expect(validateChannelConfig("stripe", { secretKey: "••••abcd" })).toEqual([]);
  });

  it("bankcard 网关地址/商户号校验", () => {
    expect(validateChannelConfig("bankcard", { gatewayUrl: "not-url" })).toContain(
      "网关地址需为 http(s) 地址",
    );
    expect(validateChannelConfig("bankcard", { merchantId: "m1" })).toContain(
      "商户号 Merchant ID 过短",
    );
    expect(
      validateChannelConfig("bankcard", {
        gatewayUrl: "https://gw.example.com/pay",
        merchantId: "m1234",
      }),
    ).toEqual([]);
  });

  it("paypal 通知地址校验", () => {
    expect(validateChannelConfig("paypal", { notifyUrl: "x" })).toContain(
      "Webhook 通知地址需为 http(s) 地址",
    );
    expect(validateChannelConfig("paypal", { notifyUrl: "https://ex.com/hook" })).toEqual([]);
  });

  it("遗留分支回归：alipay/wechat 校验不受影响", () => {
    expect(
      validateChannelConfig("alipay", { privateKey: "no-pem", alipayPublicKey: "no-pem" }),
    ).toContain("应用私钥需为 PEM 格式（含 -----BEGIN）");
    expect(validateChannelConfig("wechat", { mchId: "abc" })).toContain("商户号 mchId 需为纯数字");
  });
});

describe("渠道结算币种支持（多币种支付管理）", () => {
  it("国内网关（alipay/wechat/bankcard）仅支持 CNY", () => {
    expect(getProvider("alipay").supportedCurrencies).toEqual(["CNY"]);
    expect(getProvider("wechat").supportedCurrencies).toEqual(["CNY"]);
    expect(getProvider("bankcard").supportedCurrencies).toEqual(["CNY"]);
  });

  it("多币种渠道（mock/stripe/paypal）不声明币种限制", () => {
    expect(getProvider("mock").supportedCurrencies).toBeUndefined();
    expect(getProvider("stripe").supportedCurrencies).toBeUndefined();
    expect(getProvider("paypal").supportedCurrencies).toBeUndefined();
  });
});
