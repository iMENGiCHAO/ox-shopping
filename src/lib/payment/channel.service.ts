import "server-only";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { decryptChannelConfig, encryptChannelConfig } from "@/lib/payment/channel-crypto";
import { getProvider, CHANNEL_META } from "@/lib/payment/providers";
import type { PaymentChannelRuntime } from "@/lib/payment/provider";
import { mockPaymentAllowedInProd } from "@/lib/env";

/**
 * 支付渠道读写服务。
 * DB 存密文（configEncrypted），对外（service/API）一律解密后再返回；
 * 后台列表返回的敏感字段脱敏，前台列表只返回 enabled 渠道的 code/name。
 */

function mask(v: string): string {
  return v ? `••••${v.slice(-4)}` : "";
}

function safeDecrypt(blob: string): Record<string, unknown> {
  try {
    return decryptChannelConfig(blob);
  } catch {
    // 密文损坏/密钥更换 → 视为空配置（前台判「暂未开通」，后台可重新编辑）
    return {};
  }
}

function toRuntime(row: {
  id: string;
  code: string;
  name: string;
  provider: string;
  enabled: boolean;
  sortOrder: number;
  configEncrypted: string;
}): PaymentChannelRuntime {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    provider: row.provider,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    config: safeDecrypt(row.configEncrypted),
  };
}

/** 按 provider 取 secret 字段名集合（脱敏用） */
function secretKeys(provider: string): Set<string> {
  const meta = CHANNEL_META.find((m) => m.provider === provider);
  return new Set((meta?.fields ?? []).filter((f) => f.secret).map((f) => f.key));
}

/** 解密后的全部渠道（内部） */
export async function listChannelsRuntime(): Promise<PaymentChannelRuntime[]> {
  const rows = await prisma.paymentChannel.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return rows.map(toRuntime);
}

export async function getChannelRuntimeByCode(code: string): Promise<PaymentChannelRuntime | null> {
  const row = await prisma.paymentChannel.findUnique({ where: { code } });
  return row ? toRuntime(row) : null;
}

/**
 * 前台渠道枚举：返回全部内置渠道及其可用状态（不含任何密钥）。
 * available = 已创建 + 已启用 + 已配置 + 渠道真实可收款（isReady）；
 * 预留级渠道（alipay/wechat/bankcard/paypal）即使配置并启用，前台仍置灰
 * 「暂未开通」——避免顾客选了一个必然下单失败的方式。
 */
export interface FrontendChannel {
  code: string;
  name: string;
  available: boolean;
  /** 渠道就绪但不支持该币种 → 前台显示「请切换币种」而非「暂未开通」 */
  currencyMismatch?: boolean;
}

export async function listChannelsForFrontend(currency?: string): Promise<FrontendChannel[]> {
  const channels = await listChannelsRuntime();
  const cur = currency?.toUpperCase();
  return CHANNEL_META.map((m) => {
    const c = channels.find((x) => x.code === m.code);
    if (!c) return { code: m.code, name: m.name, available: false };
    const provider = getProvider(c.provider);
    const ready =
      c.enabled &&
      provider.isConfigured(c.config) &&
      (provider.isReady ? provider.isReady(c.config) : true);
    // 生产环境守卫：mock 渠道（免费下单）不对顾客展示——防止生产漏配时顾客选到
    // 「模拟支付」却必然失败/或直接免费成交。本地演示与测试不受影响。
    const envAllowed = m.code === "mock" ? mockPaymentAllowedInProd : true;
    // 币种匹配：渠道声明了支持币种（如国内网关仅 CNY）且传入币种不在其中 → 置灰 + 提示切换币种
    const supportsCurrency =
      !cur || !provider.supportedCurrencies || provider.supportedCurrencies.includes(cur);
    const out: FrontendChannel = {
      code: m.code,
      name: c.name ?? m.name,
      available: ready && supportsCurrency && envAllowed,
    };
    if (ready && !supportsCurrency) out.currencyMismatch = true;
    return out;
  });
}

/** 后台渠道列表：含脱敏后的 config、「是否已配置」与「是否真实可收款」 */
export async function listAdminChannels() {
  const channels = await listChannelsRuntime();
  return channels.map((c) => {
    const sks = secretKeys(c.provider);
    const masked: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(c.config)) {
      masked[k] = sks.has(k) ? mask(String(v ?? "")) : v;
    }
    const provider = getProvider(c.provider);
    const configured = provider.isConfigured(c.config);
    // ready = 配置完整 + 网关真实接入（预留级渠道恒 false，接入后置灰消失）
    const ready = configured && (provider.isReady ? provider.isReady(c.config) : true);
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      provider: c.provider,
      enabled: c.enabled,
      sortOrder: c.sortOrder,
      config: masked,
      configured,
      ready,
      /**
       * 「密钥都填好了却仍不可用」时向运营解释原因。
       * 只在 configured && !ready 时有值——配置都没填全时，运营自己知道该填什么，
       * 再叠一句「网关未接入」反而干扰。
       */
      readyNote: configured && !ready ? provider.readinessNote : undefined,
    };
  });
}

/** 新增/编辑渠道；secret 字段空值或掩码 = 保留旧值（避免误覆盖密钥），并加密落库 */
export async function upsertChannel(input: {
  id?: string;
  code: string;
  name: string;
  provider: string;
  enabled: boolean;
  sortOrder: number;
  config: Record<string, unknown>;
}): Promise<PaymentChannelRuntime> {
  // 校验 provider 已登记
  getProvider(input.provider);

  // 新建时检查 code 唯一（编辑时 code 不变则允许命中自身）
  if (!input.id) {
    const dup = await prisma.paymentChannel.findUnique({ where: { code: input.code } });
    if (dup) throw conflict("A payment channel with this code already exists");
  }

  const next: Record<string, unknown> = { ...input.config };
  if (input.id) {
    const existing = await prisma.paymentChannel.findUnique({ where: { id: input.id } });
    if (existing) {
      const oldConfig = safeDecrypt(existing.configEncrypted);
      for (const key of secretKeys(input.provider)) {
        const incoming = String(next[key] ?? "");
        if (incoming === "" || incoming.startsWith("••••")) {
          next[key] = oldConfig[key] ?? "";
        }
      }
    } else {
      throw notFound("Payment channel not found");
    }
  }

  const blob = encryptChannelConfig(next);
  const row = input.id
    ? await prisma.paymentChannel.update({
        where: { id: input.id },
        data: {
          code: input.code,
          name: input.name,
          provider: input.provider,
          enabled: input.enabled,
          sortOrder: input.sortOrder,
          configEncrypted: blob,
        },
      })
    : await prisma.paymentChannel.create({
        data: {
          code: input.code,
          name: input.name,
          provider: input.provider,
          enabled: input.enabled,
          sortOrder: input.sortOrder,
          configEncrypted: blob,
        },
      });
  return toRuntime(row);
}

/** 启用 / 禁用渠道（启用前必须完成参数配置，避免前台出现必然失败的方式） */
export async function setChannelEnabled(id: string, enabled: boolean): Promise<void> {
  if (enabled) {
    const channel = await prisma.paymentChannel.findUnique({ where: { id } });
    if (!channel) throw notFound("Payment channel not found");
    const runtime = toRuntime(channel);
    const provider = getProvider(runtime.provider);
    if (!provider.isConfigured(runtime.config)) {
      throw badRequest("Configure this channel before enabling it — an unconfigured channel cannot accept payments");
    }
    // 生产环境守卫：mock 渠道（免费下单）不允许在生产启用——
    // 防止「后台一键启用 → 所有订单免费」。本地演示与测试不受影响。
    if (runtime.code === "mock" && !mockPaymentAllowedInProd) {
      throw badRequest(
        "Mock payment cannot be enabled in production — configure a real gateway (e.g. Stripe) instead, or set ALLOW_MOCK_PAYMENT_IN_PROD=true for demo environments",
      );
    }
  }
  const updated = await prisma.paymentChannel.updateMany({
    where: { id },
    data: { enabled },
  });
  if (updated.count === 0) throw notFound("Payment channel not found");
}
