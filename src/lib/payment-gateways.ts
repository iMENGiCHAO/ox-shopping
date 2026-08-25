/**
 * 支付网关注册表(预留):key 与未来 checkout 的 provider 实现一一对应。
 * 当前结算走 Mock 支付;凭证填好并启用后,接入对应 provider 即可切换真实收款。
 */
export const GATEWAYS = [
  {
    key: "stripe",
    name: "Stripe(全球信用卡)",
    fields: [
      { key: "publishableKey", label: "Publishable Key", secret: false },
      { key: "secretKey", label: "Secret Key", secret: true },
      { key: "webhookSecret", label: "Webhook Signing Secret", secret: true },
    ],
  },
  {
    key: "alipay",
    name: "支付宝 Alipay",
    fields: [
      { key: "appId", label: "App ID", secret: false },
      { key: "privateKey", label: "应用私钥", secret: true },
      { key: "gatewayUrl", label: "网关地址", secret: false },
    ],
  },
  {
    key: "wechatPay",
    name: "微信支付 WeChat Pay",
    fields: [
      { key: "mchId", label: "商户号", secret: false },
      { key: "apiKeyV3", label: "APIv3 密钥", secret: true },
      { key: "certSerialNo", label: "证书序列号", secret: false },
    ],
  },
  {
    key: "paypal",
    name: "PayPal",
    fields: [
      { key: "clientId", label: "Client ID", secret: false },
      { key: "clientSecret", label: "Client Secret", secret: true },
    ],
  },
] as const;

export type GatewayKey = (typeof GATEWAYS)[number]["key"];
