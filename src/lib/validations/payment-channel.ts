import { z } from "zod";
import { CHANNEL_META } from "@/lib/payment/providers";

/** 后台新增/编辑支付渠道的请求体校验 */
export const paymentChannelSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1, "请填写渠道 code").max(64),
  name: z.string().trim().min(1, "请填写显示名称").max(64),
  provider: z.string().trim().min(1).max(64),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  config: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])),
});

export type PaymentChannelInput = z.infer<typeof paymentChannelSchema>;

function isMasked(v: unknown): boolean {
  return typeof v === "string" && v.startsWith("••••");
}
function hasPem(v: string): boolean {
  return v.includes("-----BEGIN");
}
function isHttpUrl(v: string): boolean {
  return /^https?:\/\/\S+$/.test(v);
}
function isDigits(v: string): boolean {
  return /^\d+$/.test(v);
}

/**
 * 按 provider 对 config 做基础格式校验（返回错误文案数组，空 = 通过）。
 * secret 字段为空或已是掩码时跳过校验（表示保留旧值，不覆盖密钥）。
 */
export function validateChannelConfig(provider: string, config: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const s = (k: string) => (typeof config[k] === "string" ? (config[k] as string) : "");
  const secret = new Set(
    (CHANNEL_META.find((m) => m.provider === provider)?.fields ?? [])
      .filter((f) => f.secret)
      .map((f) => f.key),
  );
  const skip = (k: string) => secret.has(k) && (s(k) === "" || isMasked(config[k]));

  if (provider === "alipay") {
    if (!skip("privateKey") && s("privateKey") !== "" && !hasPem(s("privateKey")))
      errs.push("应用私钥需为 PEM 格式（含 -----BEGIN）");
    if (s("alipayPublicKey") !== "" && !hasPem(s("alipayPublicKey")))
      errs.push("支付宝公钥需为 PEM 格式（含 -----BEGIN）");
    if (s("gatewayUrl") !== "" && !isHttpUrl(s("gatewayUrl")))
      errs.push("网关地址需为 http(s) 地址");
    if (s("notifyUrl") !== "" && !isHttpUrl(s("notifyUrl")))
      errs.push("异步通知地址需为 http(s) 地址");
  } else if (provider === "wechat") {
    if (s("mchId") !== "" && !isDigits(s("mchId"))) errs.push("商户号 mchId 需为纯数字");
    if (!skip("apiV3Key") && s("apiV3Key") !== "" && s("apiV3Key").length !== 32)
      errs.push("APIv3 密钥需为 32 个字符");
    if (
      !skip("merchantPrivateKey") &&
      s("merchantPrivateKey") !== "" &&
      !hasPem(s("merchantPrivateKey"))
    )
      errs.push("商户私钥需为 PEM 格式（含 -----BEGIN）");
    if (s("notifyUrl") !== "" && !isHttpUrl(s("notifyUrl")))
      errs.push("回调通知地址需为 http(s) 地址");
  } else if (provider === "bankcard") {
    if (s("gatewayUrl") !== "" && !isHttpUrl(s("gatewayUrl")))
      errs.push("网关地址需为 http(s) 地址");
    if (s("merchantId") !== "" && s("merchantId").length < 4) errs.push("商户号 Merchant ID 过短");
    if (s("notifyUrl") !== "" && !isHttpUrl(s("notifyUrl")))
      errs.push("异步通知地址需为 http(s) 地址");
  } else if (provider === "stripe") {
    if (!skip("secretKey") && s("secretKey") !== "" && !/^sk_(test|live)_/.test(s("secretKey")))
      errs.push("Secret Key 需以 sk_test_ 或 sk_live_ 开头");
    if (
      !skip("webhookSecret") &&
      s("webhookSecret") !== "" &&
      !s("webhookSecret").startsWith("whsec_")
    )
      errs.push("Webhook 签名密钥需以 whsec_ 开头");
    if (s("publishableKey") !== "" && !/^pk_(test|live)_/.test(s("publishableKey")))
      errs.push("Publishable Key 需以 pk_test_ 或 pk_live_ 开头");
  } else if (provider === "paypal") {
    if (s("notifyUrl") !== "" && !isHttpUrl(s("notifyUrl")))
      errs.push("Webhook 通知地址需为 http(s) 地址");
  }
  return errs;
}
