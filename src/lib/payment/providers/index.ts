import "server-only";
import type { PaymentProvider } from "@/lib/payment/provider";
import { mockProvider } from "@/lib/payment/providers/mock";
import { alipayProvider, ALIPAY_FIELDS } from "@/lib/payment/providers/alipay";
import { wechatProvider, WECHAT_FIELDS } from "@/lib/payment/providers/wechat";
import { bankcardProvider, BANKCARD_FIELDS } from "@/lib/payment/providers/bankcard";
import { stripeProvider, STRIPE_FIELDS } from "@/lib/payment/providers/stripe";
import { paypalProvider, PAYPAL_FIELDS } from "@/lib/payment/providers/paypal";

/** Provider 实现注册表（provider key → 实现） */
export const PROVIDERS: Record<string, PaymentProvider> = {
  mock: mockProvider,
  alipay: alipayProvider,
  wechat: wechatProvider,
  bankcard: bankcardProvider,
  stripe: stripeProvider,
  paypal: paypalProvider,
};

export function getProvider(key: string): PaymentProvider {
  const p = PROVIDERS[key];
  if (!p) throw new Error(`未登记的支付渠道实现：${key}`);
  return p;
}

/** 渠道字段元数据（后台表单动态渲染） */
export interface ChannelFieldMeta {
  key: string;
  label: string;
  secret: boolean;
}

/** 渠道定义元数据（后台列表/表单 + 前台渠道枚举共用） */
export interface ChannelMeta {
  code: string;
  name: string;
  provider: string;
  /** 一句话说明（后台列表展示，帮后台使用者理解渠道定位） */
  description: string;
  fields: ChannelFieldMeta[];
}

/** 内置渠道定义。code 用于后台存储与回调路由 /api/pay/notify/{code}。 */
export const CHANNEL_META: ChannelMeta[] = [
  {
    code: "mock",
    name: "模拟支付",
    provider: "mock",
    description: "开发/演示用站内模拟支付，即时到账，无需配置。",
    fields: [],
  },
  {
    code: "alipay",
    name: "支付宝",
    provider: "alipay",
    description: "国内主流 · PC 网页支付（RSA2 签名/验签已就绪）。",
    fields: ALIPAY_FIELDS.map((f) => ({ ...f })),
  },
  {
    code: "wechat",
    name: "微信支付",
    provider: "wechat",
    description: "国内主流 · APIv3 证书/密钥签名已就绪。",
    fields: WECHAT_FIELDS.map((f) => ({ ...f })),
  },
  {
    code: "bankcard",
    name: "银行卡支付",
    provider: "bankcard",
    description: "通用银行卡网关（银联/收银台模式，HMAC-SHA256 验签已就绪）。",
    fields: BANKCARD_FIELDS.map((f) => ({ ...f })),
  },
  {
    code: "stripe",
    name: "Stripe",
    provider: "stripe",
    description: "国际主流信用卡 · 配置密钥即可真实收款（Stripe Checkout）。",
    fields: STRIPE_FIELDS.map((f) => ({ ...f })),
  },
  {
    code: "paypal",
    name: "PayPal",
    provider: "paypal",
    description: "国际主流电子钱包 · Orders v2 参数组装已就绪。",
    fields: PAYPAL_FIELDS.map((f) => ({ ...f })),
  },
];

export {
  mockProvider,
  alipayProvider,
  wechatProvider,
  bankcardProvider,
  stripeProvider,
  paypalProvider,
};
export { ALIPAY_FIELDS, WECHAT_FIELDS, BANKCARD_FIELDS, STRIPE_FIELDS, PAYPAL_FIELDS };
