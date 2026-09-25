import "server-only";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import type { Order, OrderItem, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env, brandFallback } from "@/lib/env";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { getLang } from "@/lib/shop-i18n-server";
import { ORDER_EXPIRE_SECONDS, TAX_RATE } from "@/lib/constants";
import { generateOrderNumber, toCents, formatMoney } from "@/lib/utils";
import { ApiError, badRequest, notFound } from "@/lib/errors";
import { payableCurrencyCodes } from "@/server/services/currency-config.service";
import { assertTransition, canTransition } from "@/lib/order-status";
import { queueMail } from "@/server/services/mail-outbox.service";
import { audit } from "@/lib/audit";
import { createNotification, notifyAdmins } from "@/server/services/notification.service";
import { distributionBridge } from "@/server/services/distribution/bridge";
import { logger } from "@/lib/logger";
import {
  createCheckoutSession,
  createStripeRefund,
  retrieveCheckoutSession,
} from "@/lib/payment/stripe";
import { createMockPaymentUrl } from "@/lib/payment/mock";
import { getChannelRuntimeByCode } from "@/lib/payment/channel.service";
import { getProvider } from "@/lib/payment/providers";
import { str } from "@/lib/payment/provider";
import { effectivePaymentMode, mockPaymentAllowedInProd } from "@/lib/env";
import { planSpecDeduction, applySpecRestock } from "@/server/services/spec-stock";
import { notifyRestock } from "@/server/services/notify-me.service";
import { logPayment } from "@/server/services/payment-log.service";
import { sanitizePlainText } from "@/lib/sanitize";
import { assertValidSpecs } from "@/server/services/cart.service";
import type { SpecSelection } from "@/server/services/cart.service";
import { calculateShippingFee } from "@/server/services/shipping.service";
import { getRateSnapshot } from "@/components/shop/currency-server";
import {
  allocateLineAmounts,
  allocateRateAmounts,
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  parseCurrencyCode,
} from "@/components/shop/currency";
import {
  lockCouponInTx,
  commitCouponRedemptionInTx,
  restoreCouponInTx,
  evaluateCoupon,
  CouponRejectError,
  normalizeCouponCode,
  normalizeEmail,
} from "@/server/services/coupon.service";
import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 订单服务：下单(事务锁库存防超卖)、支付、状态机流转、退款。
 */

export interface OrderItemInput {
  productId: string;
  quantity: number;
  /** 下单规格选择快照([{ name, value }]) */
  attributes?: SpecSelection[];
}

/**
 * 结账页内联填写的收货地址（字段与原站结账页一致）。
 * 无账号时地址无法落 addresses 表（无归属），仅快照进订单；
 * 已登录时也可用一次性新地址下单，同样只进快照。
 */
export interface CheckoutAddressInput {
  country: string;
  firstName: string;
  lastName: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  phone?: string | null;
}

export interface CreateOrderInput {
  /** 下单用户；游客结账为 null（此时必须提供 contactEmail，并二选一提供地址） */
  userId: string | null;
  /**
   * 订单联系邮箱。登录单缺省时取用户邮箱；游客单必填。
   * 该字段是订单确认/发货/退款邮件的收件人，也是游客单「每人限次券」的统计口径。
   */
  contactEmail?: string | null;
  items: OrderItemInput[];
  /** 已保存地址 id（登录单）。与 shippingAddress 二选一，同时提供时以本字段优先。 */
  addressId?: string | null;
  /** 结账页内联地址。与 addressId 二选一。 */
  shippingAddress?: CheckoutAddressInput | null;
  shippingMethod: string;
  note?: string | null;
  /** 支付渠道 code（payment_channels.code）；缺省走现有 stripe/mock 自动模式 */
  channelCode?: string | null;
  /** 折扣码（券码）。null/空 = 不使用折扣。 */
  couponCode?: string | null;
}

export type OrderWithItems = Order & { items: OrderItem[] };

/**
 * 生成游客订单查询令牌。
 * 32 字节随机数 → base64url（≈43 字符），不可猜测；订单详情页凭此免登录查看。
 */
function generateOrderAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * 订单详情链接（邮件与站内消息统一使用）。
 * 登录单直接给路径（用户登录后可访问）；**游客单必须附带查询令牌**——
 * 游客没有账号，不带令牌点开就是登录页，等于订单确认信里的链接不可用。
 */
export function orderUrlFor(order: Pick<Order, "orderNumber" | "accessToken">): string {
  const base = `${env.SITE_URL}/orders/${order.orderNumber}`;
  return order.accessToken ? `${base}?token=${encodeURIComponent(order.accessToken)}` : base;
}

/**
 * 邮件称呼：优先账号姓名，其次订单收货人姓名（游客单只有这个），
 * 都没有时回落到中性称呼，避免出现 "Hi undefined"。
 */
export function greetingName(
  userName: string | null | undefined,
  order: { addressSnapshot: unknown },
): string {
  const recipient = (order.addressSnapshot as { recipientName?: string } | null)?.recipientName;
  return userName?.trim() || recipient?.trim() || "there";
}

/** 订单金额明细（全部为**基础币种 USD**；换算成结算币种由调用方负责） */
export interface OrderAmountBreakdown {
  subtotalUsd: number;
  shippingFeeUsd: number;
  taxUsd: number;
  discountUsd: number;
  totalUsd: number;
}

/**
 * 订单金额计算 —— **单一事实来源**。
 *
 * 恒等式：`total = subtotal + shippingFee + tax − discount`
 *
 * 下单（createOrder，事务内锁定后的最新价）与折扣码试算（/api/coupons/apply）
 * 必须走同一个函数。此前两边各自手写一遍公式，一旦改动只改一处就会出现
 * 「结算页一个价、实际扣款另一个价」——这是最伤客诉的一类缺陷。
 *
 * 税费口径：TAX_RATE=0 表示「价格含税（VAT included，对齐 上游参考站 欧盟站）」，
 * 此时 tax 恒为 0，前端结算页也不显示 Tax 行，前后端一致。
 * ⚠️ 若未来启用 TAX_RATE>0，必须同步给结算页补充 Tax 行。
 */
export function computeOrderAmounts(input: {
  subtotalUsd: number;
  shippingFeeUsd: number;
  /** 券减免额（USD）；无券传 0。FREE_SHIPPING 券传的即本单运费。 */
  couponDiscountUsd?: number;
}): OrderAmountBreakdown {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const subtotalUsd = r2(Math.max(0, input.subtotalUsd));
  const shippingFeeUsd = r2(Math.max(0, input.shippingFeeUsd));
  const taxUsd = r2(subtotalUsd * TAX_RATE);
  // 减免不得超过「小计 + 运费」，否则 total 会变成负数（免邮券 + 已免邮就是这种边界）
  const ceiling = r2(subtotalUsd + shippingFeeUsd);
  const discountUsd = Math.min(Math.max(input.couponDiscountUsd ?? 0, 0), ceiling);
  const totalUsd = r2(subtotalUsd + shippingFeeUsd + taxUsd - discountUsd);
  return { subtotalUsd, shippingFeeUsd, taxUsd, discountUsd, totalUsd };
}

/** 折扣码试算结果（全部为 USD 基础币种） */
export interface OrderQuote extends OrderAmountBreakdown {
  /** 命中的券；无券为 null */
  coupon: { code: string; freeShipping: boolean } | null;
}

/**
 * 购物车试算（只读，不下单）。
 *
 * 金额一律按 DB 现价重算，**不接受前端传入的金额**——否则可被篡改。
 * 券校验失败抛 CouponRejectError，由路由翻成本地化文案返回。
 */
export async function quoteOrderAmounts(input: {
  items: OrderItemInput[];
  shippingMethod: string;
  couponCode?: string | null;
  userId?: string | null;
  email?: string | null;
}): Promise<OrderQuote> {
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  let subtotalUsd = 0;
  for (const item of input.items) {
    const p = byId.get(item.productId);
    if (!p || p.status !== "ACTIVE") {
      throw badRequest(`"${p?.name ?? "Item"}" is no longer available`);
    }
    subtotalUsd += Number(p.price) * item.quantity;
  }
  subtotalUsd = Math.round(subtotalUsd * 100) / 100;

  const shipping = await calculateShippingFee(input.shippingMethod, subtotalUsd);
  const shippingFeeUsd = shipping.fee;

  let couponResult: { code: string; freeShipping: boolean; discountUsd: number } | null = null;
  const code = input.couponCode?.trim();
  if (code) {
    const evaluated = await evaluateCoupon(
      code,
      { subtotalUsd, shippingFeeUsd },
      { userId: input.userId ?? null, email: input.email ?? null },
    );
    if (!evaluated.ok || !evaluated.coupon) {
      throw new CouponRejectError(
        evaluated.reason ?? "NOT_APPLICABLE",
        code,
        evaluated.shortfallUsd,
      );
    }
    couponResult = {
      code: evaluated.coupon.code,
      freeShipping: evaluated.freeShipping,
      discountUsd: evaluated.discountUsd,
    };
  }

  const amounts = computeOrderAmounts({
    subtotalUsd,
    shippingFeeUsd,
    couponDiscountUsd: couponResult?.discountUsd ?? 0,
  });

  return {
    ...amounts,
    coupon: couponResult
      ? { code: couponResult.code, freeShipping: couponResult.freeShipping }
      : null,
  };
}

function d(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

/**
 * 订单收货地址快照（与 Order.addressSnapshot 的 JSON 结构一一对应）。
 *
 * 两条下单入口最终都收敛到这份结构：
 *   - 地址簿（Address 表，国内式字段）→ 映射进来
 *   - 结账页内联表单（原站西式字段）→ 映射进来
 * 下游（后台订单详情 / 发票 / 导出）只认这一种结构。
 * country / postalCode 是后加字段：历史订单快照缺这两个键，渲染时按空串处理。
 */
interface AddressSnapshot {
  /** 收件人姓名（结账页把姓名拆成两栏，此处合并回一个字段） */
  recipientName: string;
  /** 联系电话；原站仅部分国家/地区要求，可能为空串 */
  phone: string;
  /** 国家/地区 ISO alpha-2 */
  country: string;
  /** 州/省 */
  province: string;
  city: string;
  /** 区/县（国内式地址使用；结账页西式表单留空） */
  district: string;
  /** 邮编 */
  postalCode: string;
  /** 街道地址（第一行；有第二行时以换行拼接，面单按多行渲染） */
  detail: string;
}

/**
 * 解析收货地址快照。
 * - 登录单：按 addressId 取**本人**的已保存地址（带 userId 过滤，防越权引用他人地址）
 * - 游客单：直接采用结账页内联填写的地址，不落 addresses 表（无账号可归属）
 */
async function resolveAddressSnapshot(input: CreateOrderInput): Promise<AddressSnapshot> {
  if (input.addressId) {
    if (!input.userId) throw badRequest("Shipping address not found");
    const address = await prisma.address.findFirst({
      where: { id: input.addressId, userId: input.userId },
    });
    if (!address) throw badRequest("Shipping address not found");
    return {
      recipientName: address.recipientName,
      phone: address.phone,
      country: address.country ?? "",
      province: address.province,
      city: address.city,
      district: address.district,
      postalCode: address.postalCode ?? "",
      // 地址簿把「公寓/单元号」存在 line2；快照合并进 detail（面单按多行渲染）
      detail: [address.detail, address.line2].filter((s) => !!s && s.trim() !== "").join("\n"),
    };
  }
  const g = input.shippingAddress;
  if (!g) throw badRequest("Shipping address not found");
  return {
    // 原站把姓名拆成 First name / Last name 两栏，快照合并回一个收件人字段，
    // 与地址簿（Address.recipientName）及后台订单详情/发票的展示口径保持一致。
    recipientName: `${g.firstName} ${g.lastName}`.trim(),
    phone: g.phone?.trim() ?? "",
    country: g.country,
    province: g.state,
    city: g.city,
    // 结账页表单没有「区/县」字段（西式地址结构），留空；
    // 走地址簿入口的订单才会带 district。
    district: "",
    postalCode: g.postalCode,
    detail: [g.line1, g.line2].filter((s) => !!s && s.trim() !== "").join("\n"),
  };
}

/**
 * 解析订单联系邮箱（订单确认/发货/退款邮件的唯一收件人来源）。
 * - 登录单：显式传入优先，否则取账号邮箱
 * - 游客单：必填（同时也是游客单查询订单、每人限次券的凭据）
 */
async function resolveContactEmail(input: CreateOrderInput): Promise<string | null> {
  const explicit = input.contactEmail?.trim();
  if (explicit) return normalizeEmail(explicit);
  if (!input.userId) throw badRequest("Please enter your email");
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  });
  return user ? normalizeEmail(user.email) : null;
}

/**
 * 创建订单(事务)：
 * - 原子扣减库存(UPDATE ... WHERE stock >= qty)，杜绝超卖
 * - 校验并计算Shipping/税费/折扣（折扣券在同事务内行锁核销）
 * - 快照收货地址、生成订单条目
 * - 清空Shopping Bag中已下单商品（游客单无购物袋，跳过）
 * - 游客单生成订单查询令牌
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderWithItems> {
  // 商品与地址校验(事务外)
  // 注意：items 可能含同一商品的多条规格行（如同款 Size S + Size M），
  // 必须用去重后的 productId 数量与查询结果比较，否则会误判"部分商品不存在"。
  const uniqueProductIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: uniqueProductIds } },
  });
  if (products.length !== uniqueProductIds.length)
    throw badRequest("Some items in your cart are no longer available");
  for (const p of products) {
    if (p.status !== "ACTIVE") throw badRequest(`"${p.name}" is no longer available`);
    // 规格白名单校验：逐条校验该商品的所有规格行（杜绝攻击者携带任意 name/value 走完整下单链路）
    for (const item of input.items.filter((i) => i.productId === p.id)) {
      assertValidSpecs(p.attributes, item.attributes);
    }
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  // 订单备注：去 HTML 后入库存档（React 渲染默认转义，sanitize 为纵深防御）
  if (input.note) {
    const cleaned = await sanitizePlainText(input.note);
    input.note = cleaned.trim().slice(0, 300) || null;
  }

  const address = await resolveAddressSnapshot(input);
  const contactEmail = await resolveContactEmail(input);
  // 游客单：生成不可猜测的一次性查询令牌（登录单为 null，走账号鉴权）
  const accessToken = input.userId ? null : generateOrderAccessToken();
  const couponCode = input.couponCode?.trim() ? normalizeCouponCode(input.couponCode) : null;

  const orderNumber = generateOrderNumber();

  // 多币种结算：读取用户选择的币种和当前汇率快照
  // 汇率快照存储在订单中，确保已结算订单金额不再随汇率变动
  const cookieStore = await cookies();
  const userCurrency =
    parseCurrencyCode(cookieStore.get(CURRENCY_COOKIE)?.value) || DEFAULT_CURRENCY;
  // 支付币种校验：后台可把某币种标记为「不可支付」（仅展示换算，不结算）。
  // null = 配置不可用，跳过校验（配置故障不能挡住正常卖货）。
  const payableCodes = await payableCurrencyCodes();
  if (payableCodes && !payableCodes.has(userCurrency)) {
    throw badRequest(
      `当前币种（${userCurrency}）暂不支持结算，请在币种选择器切换到可支付的币种后重新提交`,
    );
  }
  const rateSnap = await getRateSnapshot();
  const exchangeRate = rateSnap.rates[userCurrency] ?? 1;
  // 基础货币为 USD，用户币种金额 = USD 金额 × 汇率
  const toUserCurrency = (amountUsd: number) => Math.round(amountUsd * exchangeRate * 100) / 100;

  const order = await prisma.$transaction(async (tx) => {
    const ids = [...new Set(input.items.map((i) => i.productId))];
    // 行锁串行化同商品的并发扣减（specStock 为 JSON 读-改-写，必须先锁行）
    await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
    const freshList = await tx.product.findMany({ where: { id: { in: ids } } });
    const freshById = new Map(freshList.map((p) => [p.id, p]));

    // 0. 金额计算全部以锁行后的最新数据为准（杜绝改价窗口内按旧价成交）
    let subtotal = 0;
    for (const item of input.items) {
      const fresh = freshById.get(item.productId);
      if (!fresh || fresh.status !== "ACTIVE") {
        throw badRequest(
          `"${productById.get(item.productId)?.name ?? "Item"}" is no longer available`,
        );
      }
      subtotal += Number(fresh.price) * item.quantity;
    }
    subtotal = Number(d(subtotal));

    // 0c. Shipping 与税费（基于最新小计 + DB 物流配置）
    const shippingCalc = await calculateShippingFee(input.shippingMethod, subtotal);
    const shippingFee = shippingCalc.fee;
    const isCOD = shippingCalc.isCashOnDelivery;
    const shippingMethodId = shippingCalc.method.id;
    // 0d. 折扣码：在事务内对 coupons 行加锁后**重新**校验并算价，
    //     杜绝「结算页预览时可用、下单瞬间已被抢完/已过期」的竞态。
    let coupon: { couponId: string; couponCode: string; discountUsd: number } | null = null;
    if (couponCode) {
      coupon = await lockCouponInTx(tx, {
        code: couponCode,
        amounts: { subtotalUsd: subtotal, shippingFeeUsd: shippingFee },
        holder: { userId: input.userId, email: contactEmail },
      });
    }

    // 0e. 税费与总额：走 computeOrderAmounts —— 与试算接口同一函数，口径不可能漂移。
    //     恒等式：total = subtotal + shippingFee + tax − discount
    const amounts = computeOrderAmounts({
      subtotalUsd: subtotal,
      shippingFeeUsd: shippingFee,
      couponDiscountUsd: coupon?.discountUsd ?? 0,
    });
    const tax = amounts.taxUsd;
    const discount = amounts.discountUsd;
    const total = amounts.totalUsd;
    if (total < 0) throw badRequest("Order total is invalid");

    // 多币种结算：USD 基础金额 → 用户币种。
    // ⚠️ 必须走 allocateRateAmounts（各分量独立舍入会让明细之和 ≠ 总额，差 1–2 分）。
    // 恒等式 total = subtotal + shipping + tax − discount 在落库值上严格成立，
    // 与结账页展示共用同一函数，保证「页面显示的就是实际扣款的」。
    const amountsUser = allocateRateAmounts(
      { subtotal, shipping: shippingFee, tax, discount },
      exchangeRate,
    );
    const subtotalUser = amountsUser.subtotal;
    const shippingFeeUser = amountsUser.shipping;
    const taxUser = amountsUser.tax;
    const discountUser = amountsUser.discount;
    const totalUser = amountsUser.total;

    // 行小计对齐：Σ 行小计 = 订单小计（订单页明细求和必须等于 Subtotal 行）
    const lineSubtotalsUser = allocateLineAmounts(
      input.items.map((item) => Number(freshById.get(item.productId)!.price) * item.quantity),
      subtotalUser,
      exchangeRate,
    );

    // 1. 库存扣减（商品级 + 规格级；普通单不足即失败，预售允许缺口并记录实际扣减量）
    interface ItemDeduction {
      stockDeducted: number;
      specDeducted: Record<string, number>;
    }
    const plans: ItemDeduction[] = [];
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i]!;
      const fresh = freshById.get(item.productId)!;
      const snapshot = productById.get(item.productId)!;
      if (!fresh || fresh.status !== "ACTIVE")
        throw badRequest(`"${snapshot.name}" is no longer available`);

      // 规格级校验与扣减计划（未追踪的组/值视为可用）
      const plan = planSpecDeduction(
        fresh.specStock,
        item.attributes,
        item.quantity,
        fresh.isPresale,
      );
      if (!plan.ok && plan.shortage) {
        const s = plan.shortage;
        // 英文源串 + ERROR_ZH 本地化（原先在此写中英双语三元表达式，
        // 同一条文案维护两处必然漂移）
        throw badRequest(
          `"${snapshot.name}" variant ${s.group}:${s.value} is out of stock — only ${s.available} left`,
        );
      }

      let stockDeducted: number;
      if (fresh.isPresale) {
        // 预售：允许 0 库存下单，只扣实际可扣部分(下限 0)，销量照常累计；
        // 实扣量记入订单行，取消时精确回补（杜绝凭空造库存）
        stockDeducted = Math.min(Math.max(fresh.stock, 0), item.quantity);
        await tx.$executeRaw`UPDATE products SET stock = GREATEST(stock - ${stockDeducted}, 0), "soldCount" = "soldCount" + ${item.quantity} WHERE id = ${item.productId}`;
      } else {
        stockDeducted = item.quantity;
        const updated = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity }, status: "ACTIVE" },
          data: {
            stock: { decrement: item.quantity },
            soldCount: { increment: item.quantity },
          },
        });
        if (updated.count === 0) {
          throw badRequest(`"${snapshot.name}" is out of stock — only ${fresh.stock} left`);
        }
      }

      // 规格库存落库（JSON 整体写回；行锁保证无并发丢失更新）
      if (Object.keys(plan.deducted).length > 0) {
        await tx.product.update({
          where: { id: item.productId },
          data: { specStock: plan.next as Prisma.InputJsonValue },
        });
      }

      plans.push({ stockDeducted, specDeducted: plan.deducted });
    }

    // 2. 创建订单（存储用户币种金额 + 汇率快照）
    // COD（货到付款）：无线上支付环节，创建后直接进入「待处理」（PROCESSING）——
    // 若按 PENDING_PAYMENT 创建，会被 expireStaleOrders 在 30 分钟后自动取消（COD 必死单），
    // 且顾客会被带去线上支付页（在线支付 + 货到付款双重收款语义矛盾）。
    // COD 单的支付提供方固定为 "cod"（现金交易，无网关）；退款为线下动作。
    const created = await tx.order.create({
      data: {
        orderNumber,
        userId: input.userId,
        // 订单联系邮箱：游客单的唯一联系方式，也是游客查单与「每人限次券」的凭据
        contactEmail,
        // 游客订单查询令牌（登录单为 null，走账号鉴权）
        accessToken,
        status: isCOD ? "PROCESSING" : "PENDING_PAYMENT",
        // 多币种结算：存储用户选择的币种金额
        subtotal: d(subtotalUser),
        shippingFee: d(shippingFeeUser),
        tax: d(taxUser),
        discount: d(discountUser),
        total: d(totalUser),
        currency: userCurrency,
        // 折扣码快照：券被改/删后仍可还原当时的优惠
        couponId: coupon?.couponId ?? null,
        couponCode: coupon?.couponCode ?? null,
        // 汇率快照：1 USD 兑用户币种的汇率，确保已结算订单金额不再随汇率变动
        exchangeRate: new Prisma.Decimal(exchangeRate.toFixed(6)),
        note: input.note,
        // 物流方式（DB 配置；后台可改）
        shippingMethodId,
        // 货到付款（运费不计入 total）
        isCashOnDelivery: isCOD,
        // 到付参考金额落库：仓库/客服从订单即可见「送达时应收现金 = total + codFee」
        codFee: isCOD ? d(shippingCalc.method.fee) : null,
        // 新订单默认未读（admin 进 /orders 后自动标记为已读）
        isUnread: true,
        addressSnapshot: {
          recipientName: address.recipientName,
          phone: address.phone,
          country: address.country ?? "",
          province: address.province,
          city: address.city,
          district: address.district,
          postalCode: address.postalCode ?? "",
          detail: address.detail,
        },
        // COD（货到付款）现金交易无网关：paymentProvider 固定 "cod"；
        // 在线单按所选渠道（payment_channels.code），缺省走 stripe/mock 自动模式
        paymentProvider: isCOD ? "cod" : (input.channelCode ?? effectivePaymentMode),
        items: {
          create: input.items.map((item, idx) => {
            const p = productById.get(item.productId)!;
            const plan = plans[idx]!;
            const priceUsd = Number(freshById.get(item.productId)!.price);
            // 订单条目单价也转换为用户币种（订单详情页/管理端展示用）
            const priceUser = toUserCurrency(priceUsd);
            return {
              productId: p.id,
              productName: p.name,
              productImage: Array.isArray(p.images) ? ((p.images[0] as string) ?? null) : null,
              sku: p.sku,
              price: d(priceUser),
              quantity: item.quantity,
              // 成本价快照（USD 基准，与 price 同口径）：分销「利润分成」模式的
              // 计佣基数依赖此值 —— 之后修改成本价不影响已下单订单的利润口径
              costPrice: freshById.get(item.productId)!.costPrice,
              // 行小计用对齐后的值：Σ 行小计 == 订单小计（不这样写会出现明细求和差 1 分）
              subtotal: d(lineSubtotalsUser[idx]!),
              // 实际扣减记录（取消订单时精确回补的依据）
              stockDeducted: plan.stockDeducted,
              specDeducted:
                Object.keys(plan.specDeducted).length > 0
                  ? (plan.specDeducted as unknown as Prisma.InputJsonValue)
                  : undefined,
              attributes:
                item.attributes && item.attributes.length > 0
                  ? (item.attributes as unknown as Prisma.InputJsonValue)
                  : undefined,
            };
          }),
        },
      },
      include: { items: true },
    });

    // 3. 折扣码核销落库（与订单同一事务：订单回滚则券不消耗，不会「券没了单也没成」）
    if (coupon) {
      await commitCouponRedemptionInTx(tx, {
        couponId: coupon.couponId,
        userId: input.userId,
        email: contactEmail,
        orderId: created.id,
        discountUsd: coupon.discountUsd,
      });
    }

    // 4. 从Shopping BagRemove已下单商品（游客单无购物袋，跳过）
    if (input.userId) {
      await tx.cartItem.deleteMany({
        where: { userId: input.userId, productId: { in: input.items.map((i) => i.productId) } },
      });
    }

    return created;
  });

  await audit({
    userId: input.userId,
    action: "ORDER_CREATE",
    entity: "Order",
    entityId: order.id,
    meta: { orderNumber, total: Number(order.total) },
  });

  // 站内消息：通知所有管理员有新订单待处理（不静默）
  void notifyAdmins({
    type: "order",
    title: "新订单",
    titleEn: "New order",
    body: `客户提交了新订单 ${orderNumber}，金额 ${formatMoney(Number(order.total), order.currency)}，请及时处理。`,
    bodyEn: `A new order ${orderNumber} (${formatMoney(Number(order.total), order.currency)}) was placed. Please process it.`,
    link: "/admin/orders",
    meta: { orderNumber, total: Number(order.total), status: order.status },
  });

  // COD（货到付款）确认信：在线单在支付成功后由 markOrderPaid 发「订单已支付」；
  // COD 单直接创建为 PROCESSING、永不经过 markOrderPaid——这里补发确认信，
  // 否则顾客下单后收不到任何邮件（商业交付不可接受）。
  if (order.isCashOnDelivery) {
    const user = input.userId
      ? await prisma.user.findUnique({ where: { id: input.userId } })
      : null;
    const mailTo = contactEmail ?? user?.email ?? null;
    const due = Number(order.total) + (order.codFee == null ? 0 : Number(order.codFee));
    if (mailTo) {
      void queueMail({
        to: mailTo,
        template: "order-confirmed",
        data: {
          name: greetingName(user?.name, order),
          orderNumber: order.orderNumber,
          total: `${order.currency} ${due.toFixed(2)}`,
          items: order.items.map((i) => ({ name: i.productName, quantity: i.quantity })),
          orderUrl: orderUrlFor(order),
          isCashOnDelivery: true,
          codDue: `${order.currency} ${due.toFixed(2)}`,
        },
      });
    }
  }

  return order;
}

/** 创建支付跳转(Stripe Checkout 或模拟支付页) */
export async function createPaymentUrl(
  order: OrderWithItems,
  customerEmail: string,
): Promise<string> {
  if (order.status !== "PENDING_PAYMENT")
    throw badRequest("This order cannot be paid in its current state");

  // 收银台展示用的品牌名与订单摘要 —— 统一从站点设置取，不写死字面量。
  // 摘要按当前语言生成：英文站不该在 Stripe/PayPal 账单上出现中文。
  const settings = await getSiteSettings();
  const lang = await getLang();
  const brandName = pickLang(settings.siteName, lang).trim() || brandFallback;
  const subject =
    lang === "zh"
      ? `${brandName} 订单 ${order.orderNumber}`
      : `${brandName} Order ${order.orderNumber}`;

  const providerKey = order.paymentProvider ?? undefined;

  // 渠道分发（payment_channels）：mock / alipay / wechat / bankcard / paypal
  if (providerKey && providerKey !== "stripe") {
    const channel = await getChannelRuntimeByCode(providerKey);
    // mock 渠道无需任何配置：即使没有渠道记录（未跑 migrate:payment-channels 的环境），
    // 也保持旧行为直接给站内模拟支付页，避免开发/演示下单被中断。
    if (!channel && providerKey === "mock") {
      // 生产守卫（纵深防御）：mock 模式免费下单不允许在生产发生——
      // 本地演示与测试（REQUIRE_STRONG_SECRETS=false）不受影响。
      if (!mockPaymentAllowedInProd) {
        throw badRequest("Mock payment is not available in production, please choose another one");
      }
      return createMockPaymentUrl(order.orderNumber, order.accessToken);
    }
    if (!channel || !channel.enabled) {
      throw badRequest("This payment method is not available yet, please choose another one");
    }
    const provider = getProvider(channel.provider);
    if (!provider.isConfigured(channel.config)) {
      throw badRequest("This payment method is not configured, please choose another one");
    }
    // 生产环境守卫：mock 渠道免费下单不允许在生产发生（纵深防御，与前台置灰同口径）
    if (channel.code === "mock" && !mockPaymentAllowedInProd) {
      throw badRequest("Mock payment is not available in production, please choose another one");
    }
    // 币种兜底校验（防绕过前端置灰直接提交）：国内网关仅支持 CNY，
    // 订单币种不匹配时按原币种金额传给网关必然金额错乱/被拒——直接拒绝。
    const supported = provider.supportedCurrencies;
    if (supported && !supported.includes(order.currency.toUpperCase())) {
      throw badRequest(
        "This payment method does not support your checkout currency — switch currency or choose another one",
      );
    }
    const result = await provider.createPayment(
      {
        orderNumber: order.orderNumber,
        total: Number(order.total),
        currency: order.currency,
        subject,
        customerEmail,
        brandName,
      },
      channel.config,
    );
    void logPayment({
      orderId: order.id,
      provider: channel.provider,
      event: "checkout_created",
      amount: Number(order.total),
      gatewayId: result.transactionId ?? null,
    });
    return result.url;
  }

  // 渠道化 Stripe：后台配置并启用了「支付渠道 → Stripe」时，按渠道配置的密钥收款；
  // 未配置渠道则保持 legacy env 路径（见下方 effectivePaymentMode 分支，既有订单不受影响）。
  if (providerKey === "stripe") {
    const channel = await getChannelRuntimeByCode("stripe");
    if (channel && channel.enabled) {
      const provider = getProvider(channel.provider);
      if (!provider.isConfigured(channel.config)) {
        throw badRequest("This payment method is not configured, please choose another one");
      }
      // 币种兜底校验（与前台置灰同口径；stripe 未声明币种 = 全币种放行）
      const supported = provider.supportedCurrencies;
      if (supported && !supported.includes(order.currency.toUpperCase())) {
        throw badRequest(
          "This payment method does not support your checkout currency — switch currency or choose another one",
        );
      }
      const keys = {
        secretKey: str(channel.config, "secretKey") || undefined,
        webhookSecret: str(channel.config, "webhookSecret") || undefined,
      };
      // 并发安全：若订单已有未过期的 Checkout Session，直接复用（与 legacy 路径一致）
      if (order.paymentSessionId) {
        const existing = await retrieveCheckoutSession(order.paymentSessionId, keys);
        if (existing && existing.status === "open" && existing.url) {
          void logPayment({
            orderId: order.id,
            provider: "stripe",
            event: "checkout_reused",
            amount: Number(order.total),
            gatewayId: existing.id,
          });
          return existing.url;
        }
      }
      const result = await provider.createPayment(
        {
          orderNumber: order.orderNumber,
          total: Number(order.total),
          currency: order.currency,
          subject,
          customerEmail,
          accessToken: order.accessToken,
          brandName,
        },
        channel.config,
      );
      // 会话 ID 落库：掉单对账定时任务据此核对网关侧真实状态（渠道密钥）
      const sessionId = result.transactionId ?? null;
      if (sessionId) {
        await prisma.order
          .update({ where: { id: order.id }, data: { paymentSessionId: sessionId } })
          .catch(() => {});
      }
      void logPayment({
        orderId: order.id,
        provider: "stripe",
        event: "checkout_created",
        amount: Number(order.total),
        gatewayId: sessionId,
      });
      return result.url;
    }
  }

  if (effectivePaymentMode === "stripe") {
    // 并发安全：若订单已有未过期的 Checkout Session，直接复用（防双击支付创建多个 Session）
    if (order.paymentSessionId) {
      const existing = await retrieveCheckoutSession(order.paymentSessionId);
      if (existing && existing.status === "open" && existing.url) {
        void logPayment({
          orderId: order.id,
          provider: "stripe",
          event: "checkout_reused",
          amount: Number(order.total),
          gatewayId: existing.id,
        });
        return existing.url;
      }
    }

    const { url, sessionId } = await createCheckoutSession(
      {
        orderNumber: order.orderNumber,
        currency: order.currency,
        total: Number(order.total),
        customerEmail,
        // 游客单回跳结果页后要能继续查看订单
        accessToken: order.accessToken,
      },
      order.items.map((i) => ({
        name: i.productName,
        image: i.productImage,
        quantity: i.quantity,
        price: Number(i.price),
      })),
    );
    // 会话 ID 落库：掉单对账定时任务据此核对网关侧真实状态
    await prisma.order
      .update({ where: { id: order.id }, data: { paymentSessionId: sessionId } })
      .catch(() => {});
    void logPayment({
      orderId: order.id,
      provider: "stripe",
      event: "checkout_created",
      amount: Number(order.total),
      gatewayId: sessionId,
    });
    return url;
  }
  return createMockPaymentUrl(order.orderNumber, order.accessToken);
}

/**
 * 标记订单已支付(Webhook / 模拟支付 / 掉单对账共用)。
 * 幂等与并发安全：先条件更新原子"认领"，只有 PENDING_PAYMENT→PAID 成功的那一个调用
 * 才继续执行副作用（资金流水 / 订单确认信 / 审计 / 管理员站内通知），
 * 重复回调与并发双击均安全。
 */
export async function markOrderPaid(
  orderNumber: string,
  paymentId?: string,
): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });
  if (!order) throw notFound("Order not found");
  if (order.status !== "PENDING_PAYMENT") return order;

  // 原子认领：并发场景只有一个调用方能把状态推进到 PAID。
  // 上方幂等出口已处理所有「已支付/已取消」的重复回调（原样返回，不重发副作用）；
  // 认领条件的 OR 分支保证「不同交易号」的重复回调抢不到锁（claimed=0 → 只回读），
  // 原 paymentId 绝不会被改写，后续退款不会退到错误的 PaymentIntent。
  const claimed = await prisma.order.updateMany({
    where: {
      id: order.id,
      status: "PENDING_PAYMENT",
      OR: [{ paymentId: null }, ...(paymentId ? [{ paymentId }] : [])],
    },
    data: { status: "PAID", paidAt: new Date(), ...(paymentId ? { paymentId } : {}) },
  });
  if (claimed.count === 0) {
    return (await prisma.order.findUnique({
      where: { orderNumber },
      include: { items: true },
    }))!;
  }

  // 资金流水：支付成功（webhook / mock / 对账补记共用此函数）
  void logPayment({
    orderId: order.id,
    provider: order.paymentProvider ?? effectivePaymentMode,
    event: "paid",
    amount: Number(order.total),
    gatewayId: paymentId ?? null,
  });

  const updated = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });

  // 邮件收件人：优先订单联系邮箱（游客单只有这个），登录单兜底账号邮箱
  const user = order.userId ? await prisma.user.findUnique({ where: { id: order.userId } }) : null;
  const mailTo = order.contactEmail ?? user?.email ?? null;
  if (mailTo) {
    void queueMail({
      to: mailTo,
      template: "order-confirmed",
      data: {
        name: greetingName(user?.name, order),
        orderNumber: order.orderNumber,
        total: `${order.currency} ${Number(order.total).toFixed(2)}`,
        items: order.items.map((i) => ({ name: i.productName, quantity: i.quantity })),
        orderUrl: orderUrlFor(order),
      },
    });
  }

  await audit({
    userId: order.userId,
    action: "ORDER_PAID",
    entity: "Order",
    entityId: order.id,
    meta: { orderNumber, paymentId },
  });

  // 站内消息：支付成功（游客单无账号、无消息中心，跳过——其通知渠道是邮件）
  if (order.userId) {
    void createNotification({
      userId: order.userId,
      type: "order",
      title: "订单已支付",
      titleEn: "Order paid",
      body: `订单 ${order.orderNumber} 已收到付款，我们会尽快为您发货。`,
      bodyEn: `Order ${order.orderNumber} payment received. We will ship as soon as possible.`,
      link: `/orders/${order.orderNumber}`,
      meta: { orderNumber: order.orderNumber, status: "PAID" },
    });
  }

  // 站内消息：通知管理员订单已付款，可以发货（不静默）
  void notifyAdmins({
    type: "order",
    title: "订单已付款",
    titleEn: "Order paid",
    body: `订单 ${orderNumber} 已收到付款 ${formatMoney(Number(order.total), order.currency)}，请安排发货。`,
    bodyEn: `Order ${orderNumber} has been paid (${formatMoney(
      Number(order.total),
      order.currency,
    )}). Please arrange shipment.`,
    link: "/admin/orders",
    meta: { orderNumber, total: Number(order.total), status: "PAID" },
  });

  // 分销（隔离模块）：按关系链计提佣金。走 bridge 接口 —— 开关关闭时零开销、
  // 内部异常一律吞掉；即便这里整个失败，分销的分钟级对账也会把佣金补上。
  await distributionBridge.onOrderPaid(order.id);

  return updated!;
}

/** 取消订单(按下单时的实际扣减记录精确恢复库存) */
export async function cancelOrder(order: Order, byUserId?: string | null): Promise<Order> {
  // COD（货到付款）特殊路径：未发货的 COD 单无资金往来（现金交易），
  // 允许直接取消并回补库存——不必走退款流程（网关退款对现金交易无意义）。
  const cancellable =
    order.status === "PENDING_PAYMENT" || (order.isCashOnDelivery && order.status === "PROCESSING");
  if (!cancellable) {
    throw badRequest("This order cannot be cancelled in its current state");
  }
  // 本次回补了库存的商品 id，事务提交后触发补货通知（若从售罄变有货）
  const restockedProductIds: string[] = [];
  const updated = await prisma.$transaction(async (tx) => {
    // 条件更新做并发认领：只有仍处于可取消状态的订单才会被取消并回补
    const claimed = await tx.order.updateMany({
      where: {
        id: order.id,
        OR: [{ status: "PENDING_PAYMENT" }, { status: "PROCESSING", isCashOnDelivery: true }],
      },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (claimed.count === 0)
      throw badRequest("This order cannot be cancelled in its current state");
    const o = (await tx.order.findUnique({ where: { id: order.id }, include: { items: true } }))!;

    const ids = [...new Set(o.items.map((it) => it.productId).filter((v): v is string => !!v))];
    if (ids.length > 0) {
      await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
    }
    const productMap = new Map(
      ids.length > 0
        ? (
            await tx.product.findMany({
              where: { id: { in: ids } },
              select: { id: true, isPresale: true, specStock: true },
            })
          ).map((p) => [p.id, p])
        : [],
    );
    for (const item of o.items) {
      if (!item.productId) continue;
      const p = productMap.get(item.productId);
      // 精确回补：新订单以 stockDeducted 记录为准；
      // 历史订单(无记录)保守处理——普通单全额回补，预售单不回补(宁少勿造)
      const hasRecord = item.stockDeducted > 0 || item.specDeducted != null;
      const restoreQty =
        !hasRecord && p?.isPresale ? 0 : hasRecord ? item.stockDeducted : item.quantity;
      if (restoreQty > 0) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { increment: restoreQty },
            soldCount: { decrement: item.quantity },
          },
        });
        restockedProductIds.push(item.productId);
      } else {
        await tx.product.update({
          where: { id: item.productId },
          data: { soldCount: { decrement: item.quantity } },
        });
      }
      // 规格库存按记录精确回补
      const restoredSpec = applySpecRestock(
        p?.specStock,
        item.specDeducted as Record<string, number> | null,
      );
      if (restoredSpec) {
        await tx.product.update({
          where: { id: item.productId },
          data: { specStock: restoredSpec as unknown as Prisma.InputJsonValue },
        });
      }
    }
    // 折扣码回补：取消即把券还给客户（usedCount − 1 并删除核销记录），
    // 与库存回补同一事务，避免「库存回来了、券却没回来」。
    await restoreCouponInTx(tx, { id: o.id, couponId: o.couponId });
    return o;
  });

  // 取消回补库存后：若商品从售罄变回有货，通知等待「到货提醒」的客户（notifyRestock 内部判断 stock>0 才发）
  for (const pid of restockedProductIds) {
    void notifyRestock(pid);
  }

  await audit({
    userId: byUserId ?? order.userId,
    action: "ORDER_CANCEL",
    entity: "Order",
    entityId: order.id,
    meta: { orderNumber: order.orderNumber },
  });

  // 站内消息：订单已取消（游客单无账号，跳过）
  if (order.userId) {
    void createNotification({
      userId: order.userId,
      type: "order",
      title: "订单已取消",
      titleEn: "Order cancelled",
      body: `订单 ${order.orderNumber} 已取消。`,
      bodyEn: `Order ${order.orderNumber} has been cancelled.`,
      link: `/orders/${order.orderNumber}`,
      meta: { orderNumber: order.orderNumber, status: "CANCELLED" },
    });
  }

  return updated;
}

/** 超时未支付订单自动取消 */
export async function expireStaleOrders(): Promise<number> {
  const deadline = new Date(Date.now() - ORDER_EXPIRE_SECONDS * 1000);
  const stale = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: deadline } },
    take: 100,
  });
  let count = 0;
  for (const order of stale) {
    try {
      await cancelOrder(order, null);
      count++;
    } catch {
      /* 并发冲突忽略 */
    }
  }
  return count;
}

/** 订单状态修改(状态机校验 + 事件时间戳 + 通知 + 取消/退款的库存回补与退款发起) */
export async function updateOrderStatus(
  order: OrderWithItems,
  to: OrderStatus,
  actor: { id: string; name: string } | null,
  extra?: { trackingCompany?: string; trackingNumber?: string },
  /** 兼容旧调用参数；所有退款现统一经 outbox。 */
  _opts?: { skipGatewayRefund?: boolean },
): Promise<Order> {
  // PAID 只能由支付网关/模拟支付/对账确认产生。管理员手工状态接口绝不能
  // 绕过真实收款把普通订单直接写成 PAID。
  if (to === "PAID") {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "PAID status can only be set by a verified payment callback",
    );
  }

  // COD（货到付款）取消特殊路径：未发货的 COD 单无资金往来（现金交易），
  // 允许直接取消并回补库存——不必走退款流程（网关退款对现金交易无意义）。
  // 必须放在 canTransition 之前：静态状态机 PROCESSING → CANCELLED 禁止（在线单已进履约
  // 走 REFUNDED），COD 的这个例外只能在动态检查里放行。
  if (
    to === "CANCELLED" &&
    order.isCashOnDelivery &&
    ["PENDING_PAYMENT", "PROCESSING"].includes(order.status)
  ) {
    return await cancelOrder(order, actor?.id ?? null);
  }

  if (!canTransition(order.status, to)) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      `Cannot change order status from "${order.status}" to "${to}"`,
    );
  }

  // 取消/退款的统一处理：自动回补库存 + 走网关退款 + 发邮件。
  // 防止 admin 在后台改状态时漏掉资金链路（避免「订单已退款但用户未收到钱」）。
  if (to === "CANCELLED") {
    if (order.status !== "PENDING_PAYMENT") {
      throw new ApiError(
        400,
        "BAD_REQUEST",
        "Paid orders must go through the refund flow instead of being cancelled",
      );
    }
    const cancelled = await cancelOrder(order, actor?.id ?? null);
    return cancelled;
  }
  if (to === "REFUNDED") {
    if (!["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)) {
      throw new ApiError(
        400,
        "BAD_REQUEST",
        `Order in status "${order.status}" cannot be marked as refunded directly`,
      );
    }
    return await refundEntireOrder(order, actor?.id ?? null);
  }

  // 统一「有效物流」口径（大爷实测 bug 修复）：extra 优先（「发货」对话框
  // 本次填写），订单已有物流信息兜底 —— 「补填物流后状态下拉直推已发货」
  // 是合法路径：此前只看 extra 会误拒已填物流的订单，且邮件/站内信里的
  // 物流信息在直推路径下会整体丢失。
  const effTrackingCompany = (extra?.trackingCompany ?? order.trackingCompany ?? "").trim();
  const effTrackingNumber = (extra?.trackingNumber ?? order.trackingNumber ?? "").trim();

  const data: Prisma.OrderUpdateInput = { status: to };
  if (to === "SHIPPED") {
    // 发货必填物流信息：防止后台漏填导致用户无法追踪
    if (!effTrackingCompany) {
      throw new ApiError(400, "BAD_REQUEST", "Missing carrier; please fill in tracking info before marking as shipped");
    }
    if (!effTrackingNumber) {
      throw new ApiError(400, "BAD_REQUEST", "Missing tracking number; please fill in tracking info before marking as shipped");
    }
    data.shippedAt = new Date();
    data.trackingCompany = effTrackingCompany;
    data.trackingNumber = effTrackingNumber;
  }
  if (to === "DELIVERED") {
    data.deliveredAt = new Date();
    // COD 的线上收款确认点是送达；普通在线单保持原支付 paidAt 语义。
    if (order.isCashOnDelivery) data.paidAt = order.paidAt ?? new Date();
  }
  // 普通状态 CAS：以读取到的旧状态作为谓词，阻止两个管理员基于同一快照并发推进。
  // Prisma update({ id }) 不会检查状态，TOCTOU 下可把已退款单覆盖成已发货。
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: order.status },
    data,
  });
  if (claimed.count === 0) {
    throw new ApiError(400, "CONFLICT", "Order status has changed; refresh and try again");
  }
  const updated = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true },
  });

  // 发货通知：优先订单联系邮箱（游客单只有这个），登录单兜底账号邮箱
  if (to === "SHIPPED") {
    const user = order.userId
      ? await prisma.user.findUnique({ where: { id: order.userId } })
      : null;
    const shippedMailTo = order.contactEmail ?? user?.email ?? null;
    if (shippedMailTo) {
      void queueMail({
        to: shippedMailTo,
        template: "order-shipped",
        data: {
          name: greetingName(user?.name, order),
          orderNumber: order.orderNumber,
          trackingCompany: effTrackingCompany,
          trackingNumber: effTrackingNumber,
          orderUrl: orderUrlFor(order),
        },
      });
    }
  }

  await audit({
    userId: actor?.id ?? order.userId,
    action: `ORDER_STATUS_${to}`,
    entity: "Order",
    entityId: order.id,
    meta: { orderNumber: order.orderNumber, from: order.status, to, actor: actor?.name },
  });

  // 站内消息：状态变更（仅关键节点）
  // 注：to === "CANCELLED" / "REFUNDED" 在函数顶部 early return，不需在此处理
  // 注：游客单无账号、无消息中心，`order.userId` 为 null 时整段跳过（其通知渠道是邮件）
  if (order.userId && to === "SHIPPED") {
    const tracking = effTrackingNumber ? `（${effTrackingCompany} ${effTrackingNumber}）` : "";
    void createNotification({
      userId: order.userId,
      type: "order",
      title: "订单已发货",
      titleEn: "Order shipped",
      body: `订单 ${order.orderNumber} 已发货 ${tracking}，请注意查收。`,
      bodyEn: `Order ${order.orderNumber} has shipped ${tracking}. Please track delivery.`,
      link: `/orders/${order.orderNumber}`,
      meta: {
        orderNumber: order.orderNumber,
        status: "SHIPPED",
        trackingCompany: effTrackingCompany || null,
        trackingNumber: effTrackingNumber || null,
      },
    });
  } else if (order.userId && to === "DELIVERED") {
    void createNotification({
      userId: order.userId,
      type: "order",
      title: "订单已送达",
      titleEn: "Order delivered",
      body: `订单 ${order.orderNumber} 已送达，请确认收货。`,
      bodyEn: `Order ${order.orderNumber} has been delivered. Please confirm receipt.`,
      link: `/orders/${order.orderNumber}`,
      meta: { orderNumber: order.orderNumber, status: "DELIVERED" },
    });
  }

  // 分销（隔离模块）：确认收货 → 该订单佣金立刻转为可提现（不必等持有期）
  if (to === "DELIVERED") {
    await distributionBridge.onOrderDelivered(order.id);
  }

  return updated;
}

type RefundExecutionResult =
  | { state: "SUCCEEDED"; refundId: string; gatewayRefundId: string | null }
  | { state: "PENDING"; refundId: string; gatewayRefundId: string | null }
  | { state: "FAILED"; refundId: string; gatewayRefundId: string | null; error: string };

/** 审核退款：锁订单后重新计算 remaining，再把退款与 outbox 同事务提交。 */
export async function approveRefund(
  refundId: string,
  opts: { adminNote?: string | null } = {},
): Promise<RefundExecutionResult> {
  const claimed = await prisma.$transaction(async (tx) => {
    const snapshot = await tx.refund.findUnique({ where: { id: refundId } });
    if (!snapshot) throw notFound("Refund request not found");
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${snapshot.orderId} FOR UPDATE`;

    const fresh = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    const order = await tx.order.findUniqueOrThrow({ where: { id: fresh.orderId } });
    if (!(["REQUESTED", "FAILED"] as string[]).includes(fresh.status)) {
      throw badRequest("This refund request has already been processed");
    }
    const occupied = await tx.refund.aggregate({
      where: {
        orderId: order.id,
        id: { not: fresh.id },
        status: { in: ["REQUESTED", "APPROVED", "PENDING", "REFUNDED"] },
      },
      _sum: { amount: true },
    });
    const used = Number(occupied._sum.amount ?? 0);
    if (used + Number(fresh.amount) > Number(order.total) + 1e-9) {
      throw badRequest(
        `Total refund exceeds the order total: already used/refunded ${used.toFixed(2)}, this request ${Number(fresh.amount).toFixed(2)}, order total ${Number(order.total).toFixed(2)}`,
      );
    }
    const updated = await tx.refund.update({
      where: { id: fresh.id },
      data: { status: "APPROVED", adminNote: opts.adminNote ?? null, lastError: null },
    });
    await tx.refundOutbox.upsert({
      where: { refundId: fresh.id },
      create: {
        refundId: fresh.id,
        uniqueKey: fresh.idempotencyKey,
        status: "RETRY",
        nextAttemptAt: new Date(),
      },
      update: { status: "RETRY", nextAttemptAt: new Date(), lastError: null },
    });
    return updated;
  });

  return await processRefundOutboxItem(claimed.id);
}

/** 领取并执行一笔退款 outbox；稳定幂等键跨所有重试不变。 */
export async function processRefundOutboxItem(refundId: string): Promise<RefundExecutionResult> {
  const now = new Date();
  const stale = new Date(now.getTime() - 5 * 60_000);
  const claimed = await prisma.refundOutbox.updateMany({
    where: {
      refundId,
      OR: [
        { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", claimedAt: { lt: stale } },
      ],
    },
    data: { status: "PROCESSING", claimedAt: now, attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    const current = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
    return {
      state: current.status === "REFUNDED" ? "SUCCEEDED" : "PENDING",
      refundId,
      gatewayRefundId: current.gatewayRefundId,
    };
  }

  // Lease acquisition is not authority to spend money. Only APPROVED/PENDING may
  // call a gateway; REQUESTED/REJECTED or already-completed work is terminal locally.
  const refund = await prisma.refund.findUniqueOrThrow({
    where: { id: refundId },
    include: { order: { include: { items: true } } },
  });
  if (refund.status === "REQUESTED" || refund.status === "REJECTED") {
    await prisma.refundOutbox.update({
      where: { refundId },
      data: { status: "COMPLETED", claimedAt: null, lastError: "Refund is not approved" },
    });
    return {
      state: "FAILED",
      refundId,
      gatewayRefundId: refund.gatewayRefundId,
      error: "Refund is not approved",
    };
  }
  if (refund.status === "REFUNDED") {
    await prisma.refundOutbox.update({
      where: { refundId },
      data: { status: "COMPLETED", claimedAt: null },
    });
    return { state: "SUCCEEDED", refundId, gatewayRefundId: refund.gatewayRefundId };
  }
  const { order } = refund;
  const providerKey = order.paymentProvider ?? effectivePaymentMode;
  let gatewayRefundId: string | null = null;
  let state: RefundExecutionResult["state"] = "SUCCEEDED";

  try {
    if (providerKey === "mock" || providerKey === "cod") {
      gatewayRefundId = providerKey === "mock" ? `mock_${refund.idempotencyKey}` : null;
    } else if (providerKey === "stripe" && order.paymentId) {
      const stripeChannel = await getChannelRuntimeByCode("stripe");
      const keys =
        stripeChannel?.enabled && str(stripeChannel.config, "secretKey")
          ? { secretKey: str(stripeChannel.config, "secretKey") }
          : undefined;
      const result = await createStripeRefund(
        order.paymentId,
        Number(refund.amount),
        keys,
        refund.idempotencyKey,
      );
      gatewayRefundId = result.id;
      state =
        result.status === "succeeded"
          ? "SUCCEEDED"
          : result.status === "failed" || result.status === "canceled"
            ? "FAILED"
            : "PENDING";
    } else {
      const channel = await getChannelRuntimeByCode(providerKey);
      if (!channel?.enabled) throw new Error("Payment channel is not enabled");
      const result = await getProvider(channel.provider).refund(
        {
          orderNumber: order.orderNumber,
          amount: Number(refund.amount),
          gatewayId: order.paymentId,
          currency: order.currency,
          idempotencyKey: refund.idempotencyKey,
        },
        channel.config,
      );
      gatewayRefundId = result.gatewayRefundId;
      state =
        result.status === "failed"
          ? "FAILED"
          : result.status === "pending"
            ? "PENDING"
            : "SUCCEEDED";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    await prisma.$transaction([
      prisma.refund.update({
        where: { id: refundId },
        data: { status: "FAILED", lastError: message },
      }),
      prisma.refundOutbox.update({
        where: { refundId },
        data: {
          status: "RETRY",
          nextAttemptAt: new Date(Date.now() + 60_000),
          lastError: message,
        },
      }),
    ]);
    logger.error({ err, orderId: order.id, refundId }, "退款网关调用失败，已进入重试队列");
    return { state: "FAILED", refundId, gatewayRefundId: null, error: message };
  }

  if (state === "PENDING") {
    await prisma.$transaction([
      prisma.refund.update({
        where: { id: refundId },
        data: { status: "PENDING", gatewayRefundId },
      }),
      prisma.refundOutbox.update({
        where: { refundId },
        data: {
          status: "RETRY",
          nextAttemptAt: new Date(Date.now() + 60_000),
          lastError: "Gateway accepted refund but has not confirmed success yet",
        },
      }),
    ]);
    return { state: "PENDING", refundId, gatewayRefundId };
  }

  if (state === "FAILED") {
    const message = "Gateway rejected the refund";
    await prisma.$transaction([
      prisma.refund.update({
        where: { id: refundId },
        data: { status: "FAILED", gatewayRefundId, lastError: message },
      }),
      prisma.refundOutbox.update({
        where: { refundId },
        data: {
          status: "RETRY",
          nextAttemptAt: new Date(Date.now() + 60_000),
          lastError: message,
        },
      }),
    ]);
    return { state: "FAILED", refundId, gatewayRefundId, error: message };
  }

  await prisma.$transaction([
    prisma.refund.update({
      where: { id: refundId },
      data: {
        status: "REFUNDED",
        gatewayRefundId,
        lastError: null,
        processedAt: new Date(),
      },
    }),
    prisma.refundOutbox.update({
      where: { refundId },
      data: { status: "COMPLETED", lastError: null, claimedAt: null },
    }),
  ]);

  // 只有网关明确成功后才冲正；失败/pending 绝不提前改订单终态或分销账。
  await distributionBridge.onOrderRefunded(order.id);
  const completed = await prisma.refund.aggregate({
    where: { orderId: order.id, status: "REFUNDED" },
    _sum: { amount: true },
  });
  if (Number(completed._sum.amount ?? 0) >= Number(order.total) - 1e-9) {
    await markOrderRefundedByGateway(order, gatewayRefundId);
  }
  void logPayment({
    orderId: order.id,
    provider: providerKey,
    event: "refunded",
    amount: Number(refund.amount),
    gatewayId: gatewayRefundId,
    payload: { refundId, idempotencyKey: refund.idempotencyKey },
  });
  return { state: "SUCCEEDED", refundId, gatewayRefundId };
}

/** 整单退款：admin 在后台把已支付订单直接置为 REFUNDED 时的统一入口。
 * 行为：
 *   1) 幂等检查：已是 REFUNDED 直接返回
 *   2) 事务内行锁订单 + 条件更新状态（并发安全）+ 库存回补 + 落库 Refund 记录
 *   3) 事务提交后再发起 Stripe 网关退款（杜绝"事务回滚但钱已退"和"重复调用重复退款"）
 *   4) 网关退款成功后回写 gatewayRefundId；失败则记录严重错误（订单已标退款但钱未退，需人工介入）
 *   5) 资金流水 / 审计 / 邮件
 */
async function refundEntireOrder(
  order: OrderWithItems,
  actorId: string | null,
  _opts?: { skipGatewayRefund?: boolean },
): Promise<Order> {
  // 幂等：已是终态直接返回（防止重复调用重复发起网关退款）
  if (order.status === "REFUNDED" || order.status === "CANCELLED") {
    return order;
  }

  // 所有整单退款也必须先进入同一退款 outbox。旧实现先把订单写 REFUNDED 再调用网关，
  // 网关失败时会留下「本地已退、网关未退」的假账；这里在调用网关前只认领退款记录。
  const queued = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    if (!["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(fresh.status)) {
      throw new ApiError(400, "BAD_REQUEST", "Order status has changed; refresh and try again");
    }
    const occupied = await tx.refund.aggregate({
      where: {
        orderId: order.id,
        status: { in: ["REQUESTED", "APPROVED", "PENDING", "REFUNDED"] },
      },
      _sum: { amount: true },
    });
    const remaining = Math.max(
      0,
      Math.round((Number(order.total) - Number(occupied._sum.amount ?? 0)) * 100) / 100,
    );
    const existing = await tx.refund.findFirst({
      where: { orderId: order.id, status: "REQUESTED" },
      orderBy: { createdAt: "asc" },
    });
    const refund =
      existing ??
      (await tx.refund.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          reason: "管理员后台整单退款",
          amount: new Prisma.Decimal(remaining.toFixed(2)),
          status: "APPROVED",
          idempotencyKey: `refund_order_${order.id}_${Date.now()}`,
          adminNote: actorId ? `actor=${actorId}` : null,
        },
      }));
    if (remaining <= 0 && !existing) {
      throw badRequest("Order has already been fully refunded or reserved");
    }
    if (existing) {
      await tx.refund.update({
        where: { id: existing.id },
        data: { status: "APPROVED", adminNote: actorId ? `actor=${actorId}` : null },
      });
    }
    await tx.refundOutbox.upsert({
      where: { refundId: refund.id },
      create: {
        refundId: refund.id,
        uniqueKey: refund.idempotencyKey,
        status: "RETRY",
        nextAttemptAt: new Date(),
      },
      update: { status: "RETRY", nextAttemptAt: new Date(), lastError: null },
    });
    return refund;
  });
  const result = await processRefundOutboxItem(queued.id);
  if (result.state === "FAILED") throw badRequest(`Refund failed: ${result.error}`);
  const finalOrder = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true },
  });
  // An existing REQUESTED may itself be partial. After its gateway success, enqueue
  // the locked remaining balance as a separate refund instead of calling the full
  // order refunded while money is still outstanding.
  if (result.state === "SUCCEEDED" && finalOrder.status !== "REFUNDED") {
    return await refundEntireOrder(finalOrder, actorId, _opts);
  }
  return finalOrder;
}

/**
 * 由网关回调（charge.refunded）触发的订单退款标记：
 * 不发起网关退款（退款已在网关侧发生），仅更新本地订单状态 + 库存回补 + 退款记录。
 * 用于 Stripe 后台手动退款或部分退款累计达全额后的状态同步。
 */
export async function markOrderRefundedByGateway(
  order: OrderWithItems,
  gatewayRefundId?: string | null,
): Promise<Order> {
  if (order.status === "REFUNDED") return order;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
    const fresh = await tx.order.findUnique({ where: { id: order.id } });
    if (!fresh || fresh.status === "REFUNDED") return fresh;
    if (!["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(fresh.status)) {
      throw new ApiError(
        400,
        "BAD_REQUEST",
        `Order in status "${fresh.status}" cannot be marked as refunded`,
      );
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });

    // 库存回补
    const productIds = [
      ...new Set(order.items.map((i) => i.productId).filter((v): v is string => !!v)),
    ];
    if (productIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(productIds)}) FOR UPDATE`;
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, isPresale: true, specStock: true },
      });
      const map = new Map(products.map((p) => [p.id, p]));
      for (const item of order.items) {
        if (!item.productId) continue;
        const p = map.get(item.productId);
        const hasRecord = item.stockDeducted > 0 || item.specDeducted != null;
        const restoreQty =
          !hasRecord && p?.isPresale ? 0 : hasRecord ? item.stockDeducted : item.quantity;
        if (restoreQty > 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: restoreQty }, soldCount: { decrement: item.quantity } },
          });
        } else if (item.quantity > 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { soldCount: { decrement: item.quantity } },
          });
        }
        const restoredSpec = applySpecRestock(
          p?.specStock,
          item.specDeducted as Record<string, number> | null,
        );
        if (restoredSpec) {
          await tx.product.update({
            where: { id: item.productId },
            data: { specStock: restoredSpec as unknown as Prisma.InputJsonValue },
          });
        }
      }
    }

    // 折扣码回补：网关侧退款同样把券还给客户
    await restoreCouponInTx(tx, { id: order.id, couponId: order.couponId });

    // 补退款记录（网关侧已退款，本地可能无记录）
    const existing = await tx.refund.findFirst({
      where: { orderId: order.id, status: { in: ["REQUESTED", "APPROVED", "REFUNDED"] } },
    });
    if (!existing) {
      await tx.refund.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          reason: "网关侧退款（Stripe webhook charge.refunded）",
          amount: new Prisma.Decimal(Number(order.total).toFixed(2)),
          status: "REFUNDED",
          idempotencyKey: `gateway_${gatewayRefundId ?? order.id}`,
          gatewayRefundId: gatewayRefundId ?? null,
        },
      });
    } else if (gatewayRefundId && !existing.gatewayRefundId) {
      await tx.refund.update({ where: { id: existing.id }, data: { gatewayRefundId } });
    }

    return tx.order.findUnique({ where: { id: order.id }, include: { items: true } });
  });

  void logPayment({
    orderId: order.id,
    provider: "stripe",
    event: "refunded",
    amount: Number(order.total),
    gatewayId: gatewayRefundId ?? null,
    payload: { source: "stripe_webhook" },
  });

  await audit({
    userId: order.userId,
    action: "ORDER_REFUND_BY_GATEWAY",
    entity: "Order",
    entityId: order.id,
    meta: { orderNumber: order.orderNumber, gatewayRefundId },
  });

  // 分销（隔离模块）：网关退款 → 佣金冲正
  await distributionBridge.onOrderRefunded(order.id);

  return updated!;
}

export async function getOrderByNumber(orderNumber: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });
  if (!order) throw notFound("Order not found");
  return order;
}

export async function getOrderById(id: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) throw notFound("Order not found");
  return order;
}

/**
 * 订单访问鉴权（登录单与游客单统一入口）。
 * - 登录单：必须本人
 * - 游客单：必须携带与该订单匹配的 accessToken（订单确认信里的链接自带）
 *
 * 两种失败一律抛同一个 403 文案，不区分「订单不存在」与「无权访问」，
 * 避免攻击者用错误差异探测有效订单号。
 *
 * 文案必须是**英文源串**：本函数被顾客侧路由（`/api/orders/[orderNumber]/*`）使用，
 * 中文由 `ERROR_ZH` 按请求语言提供。
 */
export function assertOrderOwner(order: Order, userId: string): void {
  if (order.userId !== userId) {
    throw new ApiError(403, "FORBIDDEN", "You don't have access to this order");
  }
}

/**
 * 订单访问鉴权（登录单与游客单统一入口）。
 * - 登录单：必须本人
 * - 游客单：必须携带与该订单匹配的 accessToken（订单确认信里的链接自带）
 *
 * 两种失败一律抛同一个 403 文案，不区分「订单不存在」与「无权访问」，
 * 避免攻击者用错误差异探测有效订单号。
 */
export function assertOrderAccess(
  order: Pick<Order, "userId" | "accessToken">,
  viewer: { userId?: string | null; token?: string | null },
): void {
  if (order.userId) {
    if (!viewer.userId || viewer.userId !== order.userId) {
      throw new ApiError(403, "FORBIDDEN", "You don't have access to this order");
    }
    return;
  }
  const expected = order.accessToken;
  if (!expected || !viewer.token || !timingSafeEqualStr(viewer.token, expected)) {
    throw new ApiError(403, "FORBIDDEN", "You don't have access to this order");
  }
}

/** 常量时间比较，避免通过响应时间差逐字节猜出查询令牌 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * 校验游客订单查询令牌是否匹配（常量时间比较）。
 * 订单未签发令牌（登录单）或未携带令牌时一律返回 false。
 */
export function isOrderTokenValid(
  order: Pick<Order, "accessToken">,
  token: string | null | undefined,
): boolean {
  if (!order.accessToken || !token) return false;
  return timingSafeEqualStr(token, order.accessToken);
}

export { assertTransition, toCents };
