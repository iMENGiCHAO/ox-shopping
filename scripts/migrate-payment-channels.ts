/* eslint-disable no-console */
/**
 * 支付渠道一次性迁移/初始化脚本。
 *
 * 用途：
 *   1. 确保全部内置渠道存在：mock（启用）+ alipay/wechat/bankcard/stripe/paypal（预留，
 *      未配置/未启用——后台「支付渠道」填参数即可接通）。
 *   2. 尽力迁移旧 SiteSetting(payment.gateways) 里已填的 alipay / wechat 配置到新表
 *      （字段名做映射；未填写的渠道跳过，不覆盖）。
 *
 * 用法：
 *   npm run migrate:payment-channels        # 需先有 PAYMENT_CHANNEL_ENC_KEY
 *
 * 幂等：可重复执行；已存在的渠道不会被覆盖（enabled/配置均保持不动）。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { encryptConfig } from "../src/lib/payment/channel-crypto-core";

const prisma = new PrismaClient();

async function main() {
  let key = process.env.PAYMENT_CHANNEL_ENC_KEY;
  if (!key) {
    console.warn("⚠ 未设置 PAYMENT_CHANNEL_ENC_KEY，使用开发默认值（生产请务必配置）");
    key = "dev-payment-channel-enc-key-change-me";
  } else if (key === "dev-payment-channel-enc-key-change-me") {
    console.warn("⚠ 当前为开发默认密钥，生产环境请替换为随机值以免密文可被预测");
  }

  // 1. 确保全部内置渠道存在（幂等，update 不覆盖既有配置/状态）
  const builtin = [
    { code: "mock", name: "模拟支付", provider: "mock", enabled: true, sortOrder: 0 },
    { code: "alipay", name: "支付宝", provider: "alipay", enabled: false, sortOrder: 10 },
    { code: "wechat", name: "微信支付", provider: "wechat", enabled: false, sortOrder: 20 },
    { code: "bankcard", name: "银行卡支付", provider: "bankcard", enabled: false, sortOrder: 30 },
    { code: "stripe", name: "Stripe", provider: "stripe", enabled: false, sortOrder: 40 },
    { code: "paypal", name: "PayPal", provider: "paypal", enabled: false, sortOrder: 50 },
  ] as const;
  for (const ch of builtin) {
    await prisma.paymentChannel.upsert({
      where: { code: ch.code },
      update: {},
      create: { ...ch, configEncrypted: encryptConfig(key, {}) },
    });
  }
  const mock = await prisma.paymentChannel.findUniqueOrThrow({ where: { code: "mock" } });
  console.log(
    `✓ 内置渠道就绪（mock ${mock.enabled ? "启用" : "停用"}；alipay/wechat/bankcard/stripe/paypal 已预留待配置）`,
  );

  // 2. 迁移旧配置（旧字段 → 新字段映射）
  const row = await prisma.siteSetting.findUnique({ where: { key: "payment.gateways" } });
  const old = (row?.value ?? {}) as Record<string, Record<string, unknown>>;

  const legacy = [
    {
      code: "alipay",
      provider: "alipay",
      name: "支付宝",
      legacyKey: "alipay",
      fields: { appId: "appId", privateKey: "privateKey", gatewayUrl: "gatewayUrl" },
    },
    {
      code: "wechat",
      provider: "wechat",
      name: "微信支付",
      legacyKey: "wechatPay",
      fields: { mchId: "mchId", apiV3Key: "apiKeyV3", serialNo: "certSerialNo" },
    },
  ] as const;

  for (const spec of legacy) {
    const src = old[spec.legacyKey] ?? {};
    const config: Record<string, unknown> = {};
    for (const [newKey, oldKey] of Object.entries(spec.fields)) {
      config[newKey] = typeof src[oldKey] === "string" ? src[oldKey] : "";
    }
    const hasAny = Object.values(config).some((v) => typeof v === "string" && v.length > 0);
    if (!hasAny) {
      console.log(`- 跳过 ${spec.code}（旧配置为空，未迁移）`);
      continue;
    }
    const enabled = src.enabled === true;
    await prisma.paymentChannel.upsert({
      where: { code: spec.code },
      update: { configEncrypted: encryptConfig(key, config) },
      create: {
        code: spec.code,
        name: spec.name,
        provider: spec.provider,
        enabled,
        sortOrder: 0,
        configEncrypted: encryptConfig(key, config),
      },
    });
    console.log(`✓ 已迁移旧 ${spec.code} 配置（enabled=${enabled}）`);
  }

  console.log("完成。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
