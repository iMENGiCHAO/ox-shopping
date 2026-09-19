import { createHmac, createSign, createVerify, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RSA（SHA256withRSA）签名 / 验签工具 —— 支付宝 RSA2 与微信支付 v3 共用。
 * 不依赖任何第三方 SDK，仅用 node:crypto，方便单元测试。
 */

/** HMAC-SHA256 签名（银行卡等通用网关回调验签共用），返回 base64 */
export function signWithHmac(secretKey: string, data: string): string {
  return createHmac("sha256", secretKey).update(data, "utf8").digest("base64");
}

/** HMAC-SHA256 验签（timingSafeEqual 防时序攻击） */
export function verifyWithHmac(secretKey: string, data: string, signatureBase64: string): boolean {
  const expected = Buffer.from(signWithHmac(secretKey, data), "base64");
  const actual = Buffer.from(signatureBase64, "base64");
  if (expected.length !== actual.length || expected.length === 0) return false;
  return timingSafeEqual(expected, actual);
}

/** 用商户私钥(PEM)对数据做 SHA256withRSA 签名，返回 base64 */
export function signWithRsa(privateKeyPem: string, data: string): string {
  const sign = createSign("RSA-SHA256");
  sign.update(data, "utf8");
  sign.end();
  return sign.sign(privateKeyPem, "base64");
}

/** 用公钥(PEM)验签，返回是否通过（公钥格式错误等直接视为失败） */
export function verifyWithRsa(
  publicKeyPem: string,
  data: string,
  signatureBase64: string,
): boolean {
  try {
    const verify = createVerify("RSA-SHA256");
    verify.update(data, "utf8");
    verify.end();
    return verify.verify(publicKeyPem, signatureBase64, "base64");
  } catch {
    return false;
  }
}

/**
 * 支付宝 RSA2 签名原文：除 sign、sign_type 外，按参数名 ASCII 字典序，
 * 以 `k=v` 用 `&` 拼接。
 */
export function buildAlipaySignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type")
    .sort()
    .map((k) => `${k}=${params[k] ?? ""}`)
    .join("&");
}

/**
 * 微信支付 v3 签名头。
 * 签名串规范：`{method}\n{urlPath}\n{timestamp}\n{nonce}\n{body}\n`，
 * 用商户私钥做 SHA256withRSA，装配 `WECHATPAY2-SHA256-RSA2048` Authorization 头。
 * nonce/timestamp 可注入以便单元测试；缺省时随机生成。
 */
export function buildWechatAuthorization(opts: {
  method: string;
  path: string;
  body: string;
  mchId: string;
  serialNo: string;
  privateKey: string;
  nonce?: string;
  timestamp?: number;
}): string {
  const nonce = opts.nonce ?? randomBytes(16).toString("hex");
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const message = `${opts.method}\n${opts.path}\n${timestamp}\n${nonce}\n${opts.body}\n`;
  const signature = signWithRsa(opts.privateKey, message);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${opts.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${opts.serialNo}"`;
}
