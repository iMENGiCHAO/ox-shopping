import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  buildAlipaySignContent,
  buildWechatAuthorization,
  signWithRsa,
  verifyWithRsa,
} from "@/lib/payment/signature";

const kp = generateKeyPairSync("rsa", { modulusLength: 2048 });
const priv = kp.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const pub = kp.publicKey.export({ type: "spki", format: "pem" }).toString();

describe("RSA（SHA256withRSA）签名 / 验签", () => {
  it("签名可被对应公钥验签通过", () => {
    const sig = signWithRsa(priv, "hello");
    expect(verifyWithRsa(pub, "hello", sig)).toBe(true);
  });

  it("数据被篡改后验签失败", () => {
    const sig = signWithRsa(priv, "hello");
    expect(verifyWithRsa(pub, "hello world", sig)).toBe(false);
  });

  it("错误公钥验签失败", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const otherPub = other.publicKey.export({ type: "spki", format: "pem" }).toString();
    const sig = signWithRsa(priv, "hello");
    expect(verifyWithRsa(otherPub, "hello", sig)).toBe(false);
  });
});

describe("buildAlipaySignContent", () => {
  it("排除 sign/sign_type 并按 key 字典序拼接", () => {
    const content = buildAlipaySignContent({ b: "2", a: "1", sign: "x", sign_type: "RSA2" });
    expect(content).toBe("a=1&b=2");
  });
});

describe("buildWechatAuthorization", () => {
  it("生成 WECHATPAY2-SHA256-RSA2048 头，签名可验", () => {
    const auth = buildWechatAuthorization({
      method: "POST",
      path: "/v3/pay/transactions/native",
      body: "{}",
      mchId: "1900000000",
      serialNo: "ABC123",
      privateKey: priv,
      nonce: "nonce123",
      timestamp: 1234567890,
    });
    expect(auth).toContain("WECHATPAY2-SHA256-RSA2048");
    expect(auth).toContain('mchid="1900000000"');
    expect(auth).toContain('nonce_str="nonce123"');
    expect(auth).toContain('timestamp="1234567890"');
    expect(auth).toContain('serial_no="ABC123"');

    const m = /signature="([^"]+)"/.exec(auth);
    expect(m).toBeTruthy();
    const message = `POST\n/v3/pay/transactions/native\n1234567890\nnonce123\n{}\n`;
    expect(verifyWithRsa(pub, message, m![1]!)).toBe(true);
  });
});