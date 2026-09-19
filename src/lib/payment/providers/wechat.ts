import "server-only";
import { badRequest } from "@/lib/errors";
import { buildWechatAuthorization } from "@/lib/payment/signature";
import { str, type PaymentProvider } from "@/lib/payment/provider";

/** 微信支付渠道配置字段元数据（后台表单动态渲染用） */
export const WECHAT_FIELDS = [
  { key: "appId", label: "App ID", secret: false },
  { key: "mchId", label: "商户号 mchId", secret: false },
  { key: "apiV3Key", label: "APIv3 密钥", secret: true },
  { key: "serialNo", label: "商户证书序列号", secret: false },
  { key: "merchantPrivateKey", label: "商户私钥", secret: true },
  { key: "notifyUrl", label: "回调通知地址", secret: false },
  { key: "sandbox", label: "沙箱模式", secret: false },
] as const;

/**
 * WechatProvider —— 微信支付（v3 API）。
 *
 * 本阶段（无商户账号）实现到「请求签名头 WECHATPAY2-SHA256-RSA2048」级别，逻辑可单元测试；
 * 真实下单/退款、以及回调验签（需下载微信平台证书）留待申请账号后再接。
 */
export const wechatProvider: PaymentProvider = {
  key: "wechat",

  isConfigured(config) {
    return (
      str(config, "mchId").length > 0 &&
      str(config, "apiV3Key").length > 0 &&
      str(config, "serialNo").length > 0 &&
      str(config, "merchantPrivateKey").length > 0
    );
  },

  isReady() {
    // 预留级：参数组装 + APIv3 签名/验签已就绪，未接真实网关 HTTPS 下单
    return false;
  },

  readinessNote:
    "参数组装与 APIv3 签名已生成，但尚未接入微信支付网关的实时下单/退款，也未下载平台证书做回调验签，因此不会对顾客展示。需开通商户号后完成网关对接再启用。",

  /** 国内网关仅支持人民币结算 */
  supportedCurrencies: ["CNY"],

  async createPayment(input, config) {
    const path = "/v3/pay/transactions/native";
    const body = JSON.stringify({
      appid: str(config, "appId"),
      mchid: str(config, "mchId"),
      description: input.subject,
      out_trade_no: input.orderNumber,
      notify_url: str(config, "notifyUrl"),
      amount: { total: Math.round(input.total * 100), currency: input.currency },
    });
    // 组装签名头（可单测）；真实请求留待申请账号后启用。
    void buildWechatAuthorization({
      method: "POST",
      path,
      body,
      mchId: str(config, "mchId"),
      serialNo: str(config, "serialNo"),
      privateKey: str(config, "merchantPrivateKey"),
    });

    throw badRequest(
      "WeChat Pay is configured but the live payment request is not wired up yet. It will be available once the merchant account is onboarded.",
    );
  },

  async verifyNotify() {
    // TODO(申请账号后启用)：需先获取微信平台证书并做回调验签，本阶段无法离线完成。
    return null;
  },

  async refund() {
    throw badRequest("WeChat Pay refunds are not connected to the live gateway yet.");
  },
};
