import "server-only";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { env, effectivePaymentMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { ORDER_EXPIRE_SECONDS } from "@/lib/constants";
import { toCents } from "@/lib/utils";
import { formatMoney } from "@/lib/utils";

/**
 * Stripe 支付。
 * 未配置密钥时 effectivePaymentMode === "mock"，走内置模拟支付(见 payment/mock.ts)。
 *
 * 密钥来源（渠道化后）：
 *  - 后台「支付渠道 → Stripe」填入密钥（加密存 payment_channels） → keys 覆盖参数生效；
 *  - 未在后台配置 Stripe 渠道 → 回落环境变量 STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET（原有行为）。
 */

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      typescript: true,
    });
  }
  return stripeClient;
}

/** 密钥覆盖（后台渠道配置注入）；字段留空 = 跟随环境变量 */
export interface StripeKeysOverride {
  secretKey?: string;
  webhookSecret?: string;
}

function clientFor(keys?: StripeKeysOverride): Stripe | null {
  if (keys?.secretKey) {
    if (keys.secretKey === env.STRIPE_SECRET_KEY) return getStripe();
    return new Stripe(keys.secretKey, {
      apiVersion: "2024-06-20",
      typescript: true,
    });
  }
  return getStripe();
}

export interface CheckoutItem {
  name: string;
  image?: string | null;
  quantity: number;
  /** 单位：元 */
  price: number;
}

export interface CheckoutOrderInfo {
  orderNumber: string;
  currency: string;
  /** 单位：元 */
  total: number;
  customerEmail: string;
  /**
   * 游客订单查询令牌（登录单为 null）。
   * 回跳地址必须带上它，否则游客付完款落在结果页后，
   * 「查看订单」会因为没有令牌而 404。
   */
  accessToken?: string | null;
}

/** 创建 Stripe Checkout Session，返回跳转 URL 与会话 ID（用于掉单对账） */
export async function createCheckoutSession(
  order: CheckoutOrderInfo,
  items: CheckoutItem[],
  keys?: StripeKeysOverride,
): Promise<{ url: string; sessionId: string }> {
  const stripe = clientFor(keys);
  if (!stripe) throw new Error("Stripe 未配置");

  // 游客单回跳时带上查询令牌（登录单为空串，URL 完全不变）
  const tokenSuffix = order.accessToken ? `&token=${encodeURIComponent(order.accessToken)}` : "";

  // Stripe 不支持 CNY；启用 Stripe 时请在 .env 使用其支持的币种(如 USD)
  if (order.currency === "CNY") {
    throw new Error(
      "Stripe 不支持 CNY 币种：请将 .env 中 CURRENCY 改为 Stripe 支持的币种(如 USD)，或使用 PAYMENT_MODE=mock",
    );
  }
  /* 零小数币种保护（P0-1）：本项目的 toCents() 一律 ×100 得到「最小货币单位」，
     这对 2 位小数币种成立，但对 JPY/KRW/VND 这类 0 位小数币种会**多收 100 倍**
     （日元 1000 会被当成 100000 分 = 1000 日元？不 —— 反过来：显示 ¥1000 会向 Stripe 传
     unit_amount=100000，即实收 ¥100000）。webhook 与对账用同一错误口径校验，因此
     扣款成功、无告警。在修好按币种小数位换算之前，直接拒绝这类币种下单（宁可不卖，
     也不能错收 100 倍）。 */
  const zeroDecimal = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD"]);
  if (zeroDecimal.has(order.currency.toUpperCase())) {
    throw new Error(
      `Stripe 零小数币种（${order.currency}）尚未按最小单位换算，为避免多收 100 倍已拒绝下单：` +
        `请改用 2 位小数币种（如 USD/EUR），或使用 PAYMENT_MODE=mock`,
    );
  }

  /* 会话有效期必须与订单过期窗口对齐（P0-2）：
     `expireStaleOrders` 会在 ORDER_EXPIRE_SECONDS（默认 30 分钟）后取消未支付订单并回补库存，
     而 Stripe Checkout 默认 24 小时有效 —— 顾客在订单被取消后仍能付款，钱进了网关、
     订单却是 CANCELLED、库存已回补，webhook 侧还会静默忽略（不退款、不告警）。
     这里把会话有效期压到订单窗口（Stripe 要求 ≥30 分钟，故至少 31 分钟留出安全边）。 */
  const sessionExpiresAt = Math.floor(Date.now() / 1000) + Math.max(ORDER_EXPIRE_SECONDS, 1860);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.customerEmail,
    expires_at: sessionExpiresAt,
    line_items: items.map((item) => ({
      price_data: {
        currency: order.currency.toLowerCase(),
        unit_amount: toCents(item.price),
        product_data: {
          name: item.name,
          ...(item.image ? { images: [item.image] } : {}),
        },
      },
      quantity: item.quantity,
    })),
    metadata: {
      orderNumber: order.orderNumber,
    },
    payment_intent_data: {
      metadata: { orderNumber: order.orderNumber },
    },
    success_url: `${env.SITE_URL}/checkout/result?orderNumber=${order.orderNumber}&status=success${tokenSuffix}`,
    cancel_url: `${env.SITE_URL}/checkout/result?orderNumber=${order.orderNumber}&status=cancelled${tokenSuffix}`,
  });

  if (!session.url) throw new Error("Stripe 未返回 Checkout URL");
  return { url: session.url, sessionId: session.id };
}

/**
 * 掉单对账预留接口：按会话 ID 查询支付状态。
 * 定时任务用它核对 PENDING_PAYMENT 订单在网关侧的真实状态（已支付→补标记，过期→取消）。
 *
 * `opts` 用于给**定时对账**路径加时间上界。为什么必须能加上界：
 * 对账任务要求「单轮时长有确定边界」（中断安全，剩余下轮继续——调度器已
 * 改租约表选主，任务在事务外执行），Stripe SDK 的默认超时是 80s，一旦网关
 * 变慢，单轮对账会被外部服务延迟支配。给出上界后单轮时长有确定范围。
 * 建单路径（用户在等跳转）不传 `opts`，保持 SDK 默认行为。
 */
export interface RetrieveSessionOptions {
  /** 单次请求超时（毫秒） */
  timeoutMs?: number;
  /** 网络重试次数；对账路径建议 0（失败下轮重来，不要拖长持锁事务） */
  maxNetworkRetries?: number;
}

export async function retrieveCheckoutSession(
  sessionId: string,
  keys?: StripeKeysOverride,
  opts: RetrieveSessionOptions = {},
): Promise<Stripe.Checkout.Session | null> {
  const stripe = clientFor(keys);
  if (!stripe) return null;
  const requestOptions: Stripe.RequestOptions = {};
  if (opts.timeoutMs !== undefined) requestOptions.timeout = opts.timeoutMs;
  if (opts.maxNetworkRetries !== undefined) {
    requestOptions.maxNetworkRetries = opts.maxNetworkRetries;
  }
  try {
    return await stripe.checkout.sessions.retrieve(sessionId, {}, requestOptions);
  } catch {
    return null; // 会话不存在/网络异常/超时：对账任务跳过，不阻塞主流程
  }
}

/** 校验 Webhook 签名并构造事件(签名错误抛错 → 上层返回 400) */
export function constructWebhookEvent(
  payload: string,
  signature: string,
  keys?: StripeKeysOverride,
): Stripe.Event {
  const stripe = clientFor(keys);
  const secret = keys?.webhookSecret || env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    throw new Error("Stripe webhook 未配置");
  }
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

/** 按 Stripe refund.id 幂等落账；事件乱序或重复不会创建第二条本地退款。 */
export async function recordStripeGatewayRefund(input: {
  orderId: string;
  userId: string | null;
  refundId: string;
  amountMinor: number;
  /** Stripe refund.metadata.idempotencyKey；用于把 webhook 合并回本地审批行。 */
  localIdempotencyKey?: string | null;
  processedAt?: Date;
  client?: Prisma.TransactionClient;
}): Promise<void> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new Error("Invalid Stripe refund amount");
  }
  const client = input.client ?? prisma;
  if (input.localIdempotencyKey) {
    const approved = await client.refund.findFirst({
      where: { idempotencyKey: input.localIdempotencyKey },
    });
    if (approved) {
      if (approved.orderId !== input.orderId) {
        throw new Error("Stripe refund idempotency key belongs to another order");
      }
      await client.refund.update({
        where: { id: approved.id },
        data: {
          status: "REFUNDED",
          gatewayRefundId: input.refundId,
          processedAt: input.processedAt ?? new Date(),
          lastError: null,
        },
      });
      return;
    }
  }
  await client.refund.upsert({
    where: { gatewayRefundId: input.refundId },
    create: {
      orderId: input.orderId,
      userId: input.userId,
      reason: "Stripe webhook charge.refunded",
      amount: new Prisma.Decimal((input.amountMinor / 100).toFixed(2)),
      status: "REFUNDED",
      idempotencyKey: `stripe_refund_${input.refundId}`,
      gatewayRefundId: input.refundId,
      processedAt: input.processedAt ?? new Date(),
    },
    update: {
      status: "REFUNDED",
      processedAt: input.processedAt ?? new Date(),
      lastError: null,
    },
  });
}

/** Stripe 退款(支付成功后订单退款) */
export async function createStripeRefund(
  paymentIntentId: string,
  amountYuan: number,
  keys?: StripeKeysOverride,
  idempotencyKey?: string,
): Promise<Stripe.Refund> {
  const stripe = clientFor(keys);
  if (!stripe) throw new Error("Stripe 未配置");
  return stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount: toCents(amountYuan),
      ...(idempotencyKey ? { metadata: { idempotencyKey } } : {}),
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
}

export type WebhookClaim =
  { state: "CLAIMED"; eventId: string } | { state: "DUPLICATE"; eventId: string };

/**
 * Claim a verified provider event. Completed/ignored events and a live processing lease
 * are duplicates. FAILED or expired PROCESSING events may be reclaimed atomically.
 */
export async function claimStripeWebhookEvent(input: {
  eventId: string;
  type: string;
  leaseMs?: number;
}): Promise<WebhookClaim> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + (input.leaseMs ?? 5 * 60_000));
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: "stripe",
        eventId: input.eventId,
        type: input.type,
        status: "PROCESSING",
        attempts: 1,
        leaseUntil,
      },
    });
    return { state: "CLAIMED", eventId: input.eventId };
  } catch (err) {
    if (
      !(err instanceof Error) ||
      !("code" in err) ||
      (err as { code?: string }).code !== "P2002"
    ) {
      throw err;
    }
  }

  const current = await prisma.webhookEvent.findUniqueOrThrow({
    where: { provider_eventId: { provider: "stripe", eventId: input.eventId } },
  });
  if (current.status === "PROCESSED" || current.status === "IGNORED") {
    return { state: "DUPLICATE", eventId: input.eventId };
  }
  if (current.status === "PROCESSING" && current.leaseUntil && current.leaseUntil > now) {
    return { state: "DUPLICATE", eventId: input.eventId };
  }
  const claimed = await prisma.webhookEvent.updateMany({
    where: {
      id: current.id,
      OR: [
        { status: "FAILED" },
        { status: "PROCESSING", OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
      ],
    },
    data: { status: "PROCESSING", attempts: { increment: 1 }, leaseUntil, lastError: null },
  });
  return claimed.count === 1
    ? { state: "CLAIMED", eventId: input.eventId }
    : { state: "DUPLICATE", eventId: input.eventId };
}

export async function finishStripeWebhookEvent(
  eventId: string,
  status: "PROCESSED" | "IGNORED",
): Promise<void> {
  await prisma.webhookEvent.updateMany({
    where: { provider: "stripe", eventId, status: "PROCESSING" },
    data: { status, processedAt: new Date(), leaseUntil: null, lastError: null },
  });
}

export async function failStripeWebhookEvent(eventId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown webhook processing error";
  await prisma.webhookEvent.updateMany({
    where: { provider: "stripe", eventId, status: "PROCESSING" },
    data: { status: "FAILED", leaseUntil: null, lastError: message },
  });
}

export { effectivePaymentMode, formatMoney };
