import "server-only";

import type { Prisma } from "@prisma/client";

import { env, mailFrom } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { decryptChannelConfig, encryptChannelConfig } from "@/lib/payment/channel-crypto";

/**
 * 邮件通道配置（后台可配）。
 *
 * 为什么需要它：此前邮件通道完全由 `.env` 决定（`MAIL_PROVIDER` / `SMTP_*` /
 * `RESEND_API_KEY`），后台只能「看状态」不能改 —— 运营改一次邮件服务商要动
 * 部署配置重启服务，而卡片上的「连通性自检」在未配置时也只能落盘。
 * 这是典型的伪功能。现在配置落库、密钥加密、后台可编辑可自检。
 *
 * 设计要点：
 *  · **密钥加密落库**（复用支付渠道的 AES-256-GCM：`PAYMENT_CHANNEL_ENC_KEY`），
 *    后台接口只回「是否已配置」+ 掩码，绝不回明文；
 *  · **字段级回落 env**：DB 没填的字段用环境变量兜底 —— 既有部署升级后行为不变
 *    （`source: "env"` 表示完全没配过后台配置）；
 *  · **30s 缓存**：每封邮件都查库不可接受；保存配置时精准失效。
 */

const KEY = "mail_config";
const CACHE_TTL_MS = 30_000;

export type MailProviderId = "console" | "smtp" | "resend";

/** 落库结构（SiteSetting.value） */
interface StoredMailConfig {
  provider?: MailProviderId;
  from?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  /** 加密后的密钥块：{ smtpPass?, resendApiKey? } */
  secrets?: string;
}

/** 运行时配置（发包用） */
export interface MailRuntimeConfig {
  provider: MailProviderId;
  from: string;
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string };
  resend: { apiKey: string };
  /** db = 后台配置过；env = 完全由环境变量兜底 */
  source: "db" | "env";
}

/** 后台视图（脱敏） */
export interface AdminMailConfigView {
  provider: MailProviderId;
  from: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  /** 密钥字段只回是否已配置（永不回明文） */
  hasSmtpPass: boolean;
  hasResendApiKey: boolean;
  source: "db" | "env";
}

export interface SaveMailConfigInput {
  provider: MailProviderId;
  from?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  /** 空串或掩码（含 •）= 保留原值 */
  smtpPass?: string;
  resendApiKey?: string;
}

let cache: { value: MailRuntimeConfig; at: number } | null = null;

/** 保存配置后调用（换进程/换配置都必须立刻生效） */
export function invalidateMailConfigCache(): void {
  cache = null;
}

function safeDecrypt(blob: string | undefined): Record<string, unknown> {
  if (!blob) return {};
  try {
    return decryptChannelConfig(blob);
  } catch {
    // 密文损坏或加密密钥更换 → 视为空（后台可重新填写，不影响服务启动）
    return {};
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** 掩码或空值都表示「保留原值」（与支付渠道配置同一口径） */
function shouldPreserve(v: string | undefined): boolean {
  return !v || v.includes("•");
}

async function readStored(): Promise<StoredMailConfig | null> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: KEY } });
    if (!row || typeof row.value !== "object" || row.value === null) return null;
    return row.value as StoredMailConfig;
  } catch {
    // DB 不可用不应让发信整体失败：回落 env 配置
    return null;
  }
}

/** DB 配置优先、逐字段回落 env（既有部署升级后行为不变） */
function mergeWithEnv(stored: StoredMailConfig | null): MailRuntimeConfig {
  const secrets = safeDecrypt(stored?.secrets);
  return {
    provider: stored?.provider ?? env.MAIL_PROVIDER,
    from: (stored?.from ?? "").trim() || mailFrom,
    smtp: {
      host: (stored?.smtpHost ?? "").trim() || env.SMTP_HOST,
      port: stored?.smtpPort ?? env.SMTP_PORT,
      secure: stored?.smtpSecure ?? env.SMTP_SECURE,
      user: (stored?.smtpUser ?? "").trim() || env.SMTP_USER,
      pass: str(secrets.smtpPass) || env.SMTP_PASS,
    },
    resend: {
      apiKey: str(secrets.resendApiKey) || env.RESEND_API_KEY,
    },
    source: stored ? "db" : "env",
  };
}

export async function getMailRuntimeConfig(): Promise<MailRuntimeConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const value = mergeWithEnv(await readStored());
  cache = { value, at: Date.now() };
  return value;
}

/** 后台视图：脱敏（只回是否已配置） */
export async function getMailConfigForAdmin(): Promise<AdminMailConfigView> {
  const cfg = await getMailRuntimeConfig();
  return {
    provider: cfg.provider,
    from: cfg.from,
    smtpHost: cfg.smtp.host,
    smtpPort: cfg.smtp.port,
    smtpSecure: cfg.smtp.secure,
    smtpUser: cfg.smtp.user,
    hasSmtpPass: !!cfg.smtp.pass,
    hasResendApiKey: !!cfg.resend.apiKey,
    source: cfg.source,
  };
}

/**
 * 保存配置：密钥加密落库；空值/掩码字段保留原值。
 * 返回保存后的脱敏视图（前端直接刷新，无需二次请求）。
 */
export async function saveMailConfig(input: SaveMailConfigInput): Promise<AdminMailConfigView> {
  const existing = await readStored();
  const existingSecrets = safeDecrypt(existing?.secrets);

  const nextSecrets: Record<string, unknown> = {};
  const smtpPass = shouldPreserve(input.smtpPass)
    ? str(existingSecrets.smtpPass)
    : (input.smtpPass ?? "");
  const resendApiKey = shouldPreserve(input.resendApiKey)
    ? str(existingSecrets.resendApiKey)
    : (input.resendApiKey ?? "");
  if (smtpPass) nextSecrets.smtpPass = smtpPass;
  if (resendApiKey) nextSecrets.resendApiKey = resendApiKey;

  const value: StoredMailConfig = {
    provider: input.provider,
    from: (input.from ?? "").trim(),
    smtpHost: (input.smtpHost ?? "").trim(),
    smtpPort: input.smtpPort ?? env.SMTP_PORT,
    smtpSecure: input.smtpSecure ?? false,
    smtpUser: (input.smtpUser ?? "").trim(),
    ...(Object.keys(nextSecrets).length > 0 ? { secrets: encryptChannelConfig(nextSecrets) } : {}),
  };

  await prisma.siteSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });
  invalidateMailConfigCache();
  return await getMailConfigForAdmin();
}
