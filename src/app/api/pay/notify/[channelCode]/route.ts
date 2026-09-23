import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/utils";
import { getChannelRuntimeByCode } from "@/lib/payment/channel.service";
import { getProvider } from "@/lib/payment/providers";
import { markOrderPaid } from "@/server/services/order.service";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/**
 * POST /api/pay/notify/[channelCode] — 支付渠道统一异步回调。
 * 网关（支付宝/微信）回调到此，按渠道验签 → **核对金额** → 幂等标记订单已支付 →
 * 返回渠道要求的成功应答：支付宝「success」，微信 `{"code":"SUCCESS"}`，其他「ok」。
 * 已在 proxy.ts 中对该前缀做 CSRF 豁免（第三方回调无 CSRF token）。
 *
 * **为什么必须核对金额**：验签只能证明「这份报文确实来自网关」，
 * 不能证明「付进来的钱正好等于订单应付金额」。以下情况都会让两者不等：
 *   - 订单创建后价格被后台改动
 *   - 顾客在网关侧只付了一部分（或网关侧金额被篡改后仍以合法密钥签名）
 *   - 网关商户号/币种配置错误
 * 不核对就直接置为已付 = **按应收记账、按实收收款**，差额成为坏账。
 * 核对不通过时一律返回「失败」应答（`replyFail`），让网关按自身策略重试并告警，
 * 同时不推进订单状态 —— 失败要**保守**，宁可漏记也不可错记。
 */

/**
 * 金额比对：**一律换算成「分」的整数后精确比较，不设浮点容差**。
 *
 * 为什么不设容差：两侧都是 2 位小数的金额（订单 total 是 Decimal(10,2)，
 * 网关回调的 total_amount 也是 2 位小数），共享的 `toCents()`（`Math.round(x*100)`）
 * 已经吸收了 Decimal → Number → 分 的浮点噪声（实测 45.55 → 4555 正确）。
 * 剩下的任何不等都指向真实问题：订单金额在创建支付后被改动、或商户号/币种配置错误。
 *
 * ⚠️ 反面教材（已修）：曾写「元为单位、容差 0.01」，而
 * `90.01 - 90 === 0.010000000000005116`（IEEE754 下**大于** 0.01），
 * 于是「刚好差 1 分」被判成超容差 —— 判据本身被浮点噪声污染；
 * 而把容差调大又会把「接受 1 分以内差额」这个含混语义引进资金链路。
 * 换成整数分比较后，这一类误判从根上消失。
 */

function replySuccess(provider: string): Response {
  if (provider === "alipay") {
    return new Response("success", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (provider === "wechat") {
    return NextResponse.json({ code: "SUCCESS", message: "成功" });
  }
  return new Response("ok");
}

function replyFail(provider: string): Response {
  if (provider === "alipay") {
    return new Response("fail", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (provider === "wechat") {
    return NextResponse.json({ code: "FAIL", message: "验签失败" }, { status: 400 });
  }
  return new Response("fail", { status: 400 });
}

export const POST = apiHandler(async (req, ctx) => {
  const channelCode = routeParam(ctx.params.channelCode);
  const channel = await getChannelRuntimeByCode(channelCode);
  if (!channel) throw notFound("Payment channel not found");
  if (!channel.enabled) throw badRequest("This payment channel is not enabled");

  const provider = getProvider(channel.provider);
  const result = await provider.verifyNotify(req, channel.config);
  if (!result) {
    logger.warn({ channelCode, provider: channel.provider }, "[pay.notify] 回调验签未通过");
    return replyFail(channel.provider);
  }

  const order = await prisma.order.findUnique({ where: { orderNumber: result.orderNumber } });
  if (!order) {
    logger.warn(
      { channelCode, orderNumber: result.orderNumber },
      "[pay.notify] 回调对应的订单不存在",
    );
    return replyFail(channel.provider);
  }

  // 币种守卫：渠道声明了支持币种时，订单币种必须在其内。
  // 跨币种直接比数值是错的（100 USD ≠ 100 CNY），必须在比金额之前拦下。
  const supported = provider.supportedCurrencies;
  if (supported && !supported.includes(order.currency)) {
    logger.error(
      { channelCode, orderNumber: order.orderNumber, orderCurrency: order.currency, supported },
      "[pay.notify] 订单币种不被该渠道支持，已拒绝",
    );
    return replyFail(channel.provider);
  }

  if (result.currency && result.currency.toLowerCase() !== order.currency.toLowerCase()) {
    logger.error(
      {
        channelCode,
        orderNumber: order.orderNumber,
        callbackCurrency: result.currency,
        orderCurrency: order.currency,
      },
      "[pay.notify] 回调币种与订单币种不一致，已拒绝",
    );
    return replyFail(channel.provider);
  }

  const paidCents = toCents(result.amount);
  const dueCents = toCents(Number(order.total));
  if (!Number.isFinite(paidCents) || paidCents !== dueCents) {
    logger.error(
      {
        channelCode,
        orderNumber: order.orderNumber,
        paidAmount: result.amount,
        orderTotal: Number(order.total),
        currency: order.currency,
        transactionId: result.transactionId,
      },
      "[pay.notify] 回调金额与订单应付金额不一致，已拒绝（订单未置为已付）",
    );
    return replyFail(channel.provider);
  }

  // 幂等：重复回调 / 已支付订单由 markOrderPaid 内部原子认领保证安全。
  // transactionId 是支付交易号；Stripe Checkout 的 sessionId 仅用于会话对账。
  if (result.sessionId) {
    await prisma.order
      .updateMany({
        where: { id: order.id, paymentSessionId: null },
        data: { paymentSessionId: result.sessionId },
      })
      .catch(() => undefined);
  }
  await markOrderPaid(result.orderNumber, result.transactionId);

  return replySuccess(channel.provider);
});
