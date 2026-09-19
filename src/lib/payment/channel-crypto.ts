import "server-only";
import { env } from "@/lib/env";
import { encryptConfig, decryptConfig } from "@/lib/payment/channel-crypto-core";

/**
 * 支付渠道配置加密服务端包装（AES-256-GCM）。
 * 密钥取自环境变量 PAYMENT_CHANNEL_ENC_KEY，绝不硬编码。
 * 核心加解密逻辑见 channel-crypto-core.ts（与迁移脚本共用）。
 */

export function encryptChannelConfig(config: Record<string, unknown>): string {
  return encryptConfig(env.PAYMENT_CHANNEL_ENC_KEY, config);
}

export function decryptChannelConfig(blob: string): Record<string, unknown> {
  return decryptConfig(env.PAYMENT_CHANNEL_ENC_KEY, blob);
}

export type PaymentChannelConfig = Record<string, unknown>;