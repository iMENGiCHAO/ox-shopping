import "server-only";
import { Prisma } from "@prisma/client";
import type { Order, OrderItem, OrderStatus, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  ORDER_EXPIRE_SECONDS,
  TAX_RATE,
} from "@/lib/constants";
import { generateOrderNumber, toCents, formatMoney } from "@/lib/utils";
import { ApiError, badRequest, notFound } from "@/lib/errors";
import { assertTransition, canTransition } from "@/lib/order-status";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { createNotification, notifyAdmins } from "@/server/services/notification.service";
import { logger } from "@/lib/logger";
import { createCheckoutSession, createStripeRefund } from "@/lib/payment/stripe";
import { createMockPaymentUrl } from "@/lib/payment/mock";
import { effectivePaymentMode } from "@/lib/env";
import { planSpecDeduction, applySpecRestock } from "@/server/services/spec-stock";
import { logPayment } from "@/server/services/payment-log.service";
import { sanitizePlainText } from "@/lib/sanitize";
import { assertValidSpecs } from "@/server/services/cart.service";
import type { SpecSelection } from "@/server/services/cart.service";
import { calculateShippingFee } from "@/server/services/shipping.service";

/**
 * 订单服务：下单(事务锁库存防超卖)、支付、状态机流转、退款。
 */

export interface OrderItemInput {
  productId: string;
  quantity: number;
  /** 下单规格选择快照([{ name, value }]) */
  attributes?: SpecSelection[];
}

export interface CreateOrderInput {
  userId: string;
  items: OrderItemInput[];
  addressId: string;
  couponCode?: string | null;
  shippingMethod: string;
  note?: string | null;
}

export type OrderWithItems = Order & { items: OrderItem[] };

function d(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

function round2(n: Prisma.Decimal): number {
  return Math.round(n.toNumber() * 100) / 100;
}

/** Discount券折扣计算(不落库，供校验与下单共用) */
export function computeCouponDiscount(
  coupon: {
    type: string;
    value: Prisma.Decimal | number;
    minSpend: Prisma.Decimal | number;
    maxDiscount: Prisma.Decimal | number | null;
  },
  subtotal: number,
  shippingFee: number,
): { discount: number; freeShipping: boolean } {
  const value = Number(coupon.value);
  const maxDiscount = coupon.maxDiscount ? Number(coupon.maxDiscount) : null;

  if (subtotal < Number(coupon.minSpend)) {
    throw badRequest(`该Discount券需满 ${Number(coupon.minSpend)} 元可用`);
  }

  if (coupon.type === "PERCENTAGE") {
    let amount = Math.round(subtotal * (value / 100) * 100) / 100;
    if (maxDiscount !== null) amount = Math.min(amount, maxDiscount);
    return { discount: Math.min(amount, subtotal), freeShipping: false };
  }
  if (coupon.type === "FIXED") {
    return { discount: Math.min(value, subtotal), freeShipping: false };
  }
  // FREE_SHIPPING
  return { discount: 0, freeShipping: true };
}

export async function findUsableCoupon(code: string, userId: string) {
  const now = new Date();
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon) throw badRequest("Discount券不存在");
  if (!coupon.isActive) throw badRequest("Discount券已停用");
  if (coupon.startsAt > now || coupon.endsAt < now) throw badRequest("Discount券不在有效期内");
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw badRequest("Discount券已被领完");
  }
  return coupon;
}

/**
 * 创建订单(事务)：
 * - 原子扣减库存(UPDATE ... WHERE stock >= qty)，杜绝超卖
 * - 校验并计算Discount券/Shipping/税费
 * - 快照收货地址、生成订单条目
 * - 清空Shopping Bag中已下单商品
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderWithItems> {
  // 商品与地址校验(事务外)
  const products = await prisma.product.findMany({
    where: { id: { in: input.items.map((i) => i.productId) } },
  });
  if (products.length !== input.items.length) throw badRequest("部分商品不存在");
  for (const p of products) {
    if (p.status !== "ACTIVE") throw badRequest(`商品「${p.name}」已下架`);
    // 规格白名单校验：杜绝攻击者携带任意 name/value 走完整下单链路
    const matched = input.items.find((i) => i.productId === p.id);
    if (matched) assertValidSpecs(p.attributes, matched.attributes);
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  // 订单备注：去 HTML 后入库存档（React 渲染默认转义，sanitize 为纵深防御）
  if (input.note) {
    const cleaned = await sanitizePlainText(input.note);
    input.note = cleaned.trim().slice(0, 300) || null;
  }

  const address = await prisma.address.findFirst({
    where: { id: input.addressId, userId: input.userId },
  });
  if (!address) throw badRequest("收货地址不存在");

  // 券预校验（事务外快速失败；事务内会再次锁行校验占用与最新状态）
  let coupon: Awaited<ReturnType<typeof findUsableCoupon>> | null = null;
  if (input.couponCode) {
    coupon = await findUsableCoupon(input.couponCode, input.userId);
  }

  const orderNumber = generateOrderNumber();

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
        throw badRequest(`「${productById.get(item.productId)?.name ?? "商品"}」已下架`);
      }
      subtotal += Number(fresh.price) * item.quantity;
    }
    subtotal = Number(d(subtotal));

    // 0b. Discount券：锁行 + 限额校验（已支付 usedCount + 待支付占用均计入）
    let discount = 0;
    let freeShipping = false;
    let couponId: string | null = null;
    if (coupon) {
      await tx.$queryRaw`SELECT id FROM coupons WHERE id = ${coupon.id} FOR UPDATE`;
      const lockedCoupon = await tx.coupon.findUnique({ where: { id: coupon.id } });
      if (!lockedCoupon || !lockedCoupon.isActive) throw badRequest("Discount券已停用");
      const now = new Date();
      if (lockedCoupon.startsAt > now || lockedCoupon.endsAt < now) {
        throw badRequest("Discount券不在有效期内");
      }
      const pendingCount = await tx.couponRedemption.count({
        where: { couponId: lockedCoupon.id, order: { status: "PENDING_PAYMENT" } },
      });
      if (
        lockedCoupon.usageLimit > 0 &&
        lockedCoupon.usedCount + pendingCount >= lockedCoupon.usageLimit
      ) {
        throw badRequest("Discount券已被领完");
      }
      // 物流费根据实际选的方式从 DB 算（事务内根据最新小计算）
      const shippingCalc = await calculateShippingFee(input.shippingMethod, subtotal);
      const baseShipping = shippingCalc.fee;
      const result = computeCouponDiscount(lockedCoupon, subtotal, baseShipping);
      discount = result.discount;
      freeShipping = result.freeShipping;
      couponId = lockedCoupon.id;
    }

    // 0c. Shipping 与税费（基于最新小计 + DB 物流配置）
    // 不用券的场景：算一次 shipping；用券的场景：上面算的 baseShipping 直接用
    let shippingFee = 0;
    let isCOD = false;
    let shippingMethodId: string | null = null;
    if (!coupon) {
      const shippingCalc = await calculateShippingFee(input.shippingMethod, subtotal);
      shippingFee = shippingCalc.fee;
      isCOD = shippingCalc.isCashOnDelivery;
      shippingMethodId = shippingCalc.method.id;
    } else {
      // 用了券：复用上面算的 baseShipping（券可能免邮）
      const shippingCalc = await calculateShippingFee(input.shippingMethod, subtotal);
      shippingFee = freeShipping ? 0 : shippingCalc.fee;
      isCOD = shippingCalc.isCashOnDelivery;
      shippingMethodId = shippingCalc.method.id;
    }
    const tax = round2(d(Math.round((subtotal - discount) * TAX_RATE * 100) / 100));
    const total = round2(
      new Prisma.Decimal(0).add(d(subtotal)).sub(d(discount)).add(d(shippingFee)).add(d(tax)),
    );
    if (total < 0) throw badRequest("订单金额异常");

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
      if (!fresh || fresh.status !== "ACTIVE") throw badRequest(`「${snapshot.name}」已下架`);

      // 规格级校验与扣减计划（未追踪的组/值视为可用）
      const plan = planSpecDeduction(
        fresh.specStock,
        item.attributes,
        item.quantity,
        fresh.isPresale,
      );
      if (!plan.ok && plan.shortage) {
        throw badRequest(
          `「${snapshot.name}」规格 ${plan.shortage.group}:${plan.shortage.value} 库存不足，仅剩 ${plan.shortage.available} 件`,
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
          throw badRequest(`「${snapshot.name}」库存不足，仅剩 ${fresh.stock} 件`);
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

    // 2. 创建订单
    const created = await tx.order.create({
      data: {
        orderNumber,
        userId: input.userId,
        status: "PENDING_PAYMENT",
        subtotal: d(subtotal),
        shippingFee: d(shippingFee),
        tax: d(tax),
        discount: d(discount),
        total: d(total),
        currency: env.CURRENCY,
        note: input.note,
        // 物流方式（DB 配置；后台可改）
        shippingMethodId,
        // 货到付款（运费不计入 total）
        isCashOnDelivery: isCOD,
        // 新订单默认未读（admin 进 /orders 后自动标记为已读）
        isUnread: true,
        addressSnapshot: {
          recipientName: address.recipientName,
          phone: address.phone,
          province: address.province,
          city: address.city,
          district: address.district,
          detail: address.detail,
        },
        paymentProvider: effectivePaymentMode,
        items: {
          create: input.items.map((item, idx) => {
            const p = productById.get(item.productId)!;
            const plan = plans[idx]!;
            const price = Number(freshById.get(item.productId)!.price);
            return {
              productId: p.id,
              productName: p.name,
              productImage: Array.isArray(p.images) ? ((p.images[0] as string) ?? null) : null,
              sku: p.sku,
              price: d(price),
              quantity: item.quantity,
              subtotal: d(Math.round(price * item.quantity * 100) / 100),
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

    // 3. Discount券兑换记录
    if (couponId) {
      await tx.couponRedemption.create({
        data: {
          couponId,
          userId: input.userId,
          orderId: created.id,
          discountAmount: d(discount),
        },
      });
    }

    // 4. 从Shopping BagRemove已下单商品
    await tx.cartItem.deleteMany({
      where: { userId: input.userId, productId: { in: input.items.map((i) => i.productId) } },
    });

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

  return order;
}

/** 创建支付跳转(Stripe Checkout 或模拟支付页) */
export async function createPaymentUrl(
  order: OrderWithItems,
  customerEmail: string,
): Promise<string> {
  if (order.status !== "PENDING_PAYMENT") throw badRequest("订单当前状态不可支付");

  if (effectivePaymentMode === "stripe") {
    const { url, sessionId } = await createCheckoutSession(
      {
        orderNumber: order.orderNumber,
        currency: order.currency,
        total: Number(order.total),
        customerEmail,
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
  return createMockPaymentUrl(order.orderNumber);
}

/**
 * 标记订单已支付(Webhook / 模拟支付 / 掉单对账共用)。
 * 幂等与并发安全：先条件更新原子"认领"，只有 PENDING_PAYMENT→PAID 成功的那一个调用
 * 才继续执行券计数/发信等副作用，重复回调与并发双击均安全。
 */
export async function markOrderPaid(
  orderNumber: string,
  paymentId?: string,
): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });
  if (!order) throw notFound("订单不存在");
  if (order.status !== "PENDING_PAYMENT") return order;

  // 原子认领：并发场景只有一个调用方能把状态推进到 PAID
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, status: "PENDING_PAYMENT" },
    data: { status: "PAID", paidAt: new Date(), paymentId: paymentId ?? undefined },
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
    provider: effectivePaymentMode,
    event: "paid",
    amount: Number(order.total),
    gatewayId: paymentId ?? null,
  });

  // 券使用量 +1（事务内行锁 + 限额校验：并发支付不会超发）
  const redemptions = await prisma.couponRedemption.findMany({ where: { orderId: order.id } });
  for (const r of redemptions) {
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM coupons WHERE id = ${r.couponId} FOR UPDATE`;
      const coupon = await tx.coupon.findUnique({ where: { id: r.couponId } });
      if (!coupon) return false;
      if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return false;
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });
      return true;
    });
    if (!claimed) {
      logger.warn(
        { couponId: r.couponId, orderNumber },
        "[coupon] 券已达领取上限，使用量不再累加（需人工核对订单抵扣）",
      );
    }
  }

  const updated = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });

  const user = await prisma.user.findUnique({ where: { id: order.userId } });
  if (user) {
    void sendMail({
      to: user.email,
      template: "order-confirmed",
      data: {
        name: user.name,
        orderNumber: order.orderNumber,
        total: `${order.currency} ${Number(order.total).toFixed(2)}`,
        items: order.items.map((i) => ({ name: i.productName, quantity: i.quantity })),
        orderUrl: `${env.SITE_URL}/orders/${order.orderNumber}`,
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

  // 站内消息：支付成功
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

  return updated!;
}

/** 取消订单(按下单时的实际扣减记录精确恢复库存) */
export async function cancelOrder(order: Order, byUserId?: string | null): Promise<Order> {
  if (order.status !== "PENDING_PAYMENT") {
    throw badRequest("当前状态不可取消");
  }
  const updated = await prisma.$transaction(async (tx) => {
    // 条件更新做并发认领：只有仍是 PENDING_PAYMENT 的订单才会被取消并回补
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (claimed.count === 0) throw badRequest("当前状态不可取消");
    const o = (await tx.order.findUnique({ where: { id: order.id }, include: { items: true } }))!;

    // 释放该订单占用的优惠券额度（未支付订单取消 = 未消费，用户可再次使用该券）
    await tx.couponRedemption.deleteMany({ where: { orderId: order.id } });

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
    return o;
  });
  await audit({
    userId: byUserId ?? order.userId,
    action: "ORDER_CANCEL",
    entity: "Order",
    entityId: order.id,
    meta: { orderNumber: order.orderNumber },
  });

  // 站内消息：订单已取消
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
): Promise<Order> {
  if (!canTransition(order.status, to)) {
    throw new ApiError(400, "BAD_REQUEST", `不允许从「${order.status}」变更为「${to}」`);
  }

  // 取消/退款的统一处理：自动回补库存 + 走网关退款 + 发邮件。
  // 防止 admin 在后台改状态时漏掉资金链路（避免「订单已退款但用户未收到钱」）。
  if (to === "CANCELLED") {
    if (order.status !== "PENDING_PAYMENT") {
      throw new ApiError(400, "BAD_REQUEST", "已支付订单请使用 REFUNDED 流程");
    }
    const cancelled = await cancelOrder(order, actor?.id ?? null);
    return cancelled;
  }
  if (to === "REFUNDED") {
    if (!["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)) {
      throw new ApiError(400, "BAD_REQUEST", `当前状态「${order.status}」不可直接置为已退款`);
    }
    return await refundEntireOrder(order, actor?.id ?? null);
  }

  const data: Prisma.OrderUpdateInput = { status: to };
  if (to === "SHIPPED") {
    data.shippedAt = new Date();
    data.trackingCompany = extra?.trackingCompany ?? null;
    data.trackingNumber = extra?.trackingNumber ?? null;
  }
  if (to === "DELIVERED") data.deliveredAt = new Date();
  if (to === "PAID") data.paidAt = new Date();

  const updated = await prisma.order.update({
    where: { id: order.id },
    data,
    include: { items: true },
  });

  // 发货通知
  if (to === "SHIPPED") {
    const user = await prisma.user.findUnique({ where: { id: order.userId } });
    if (user) {
      void sendMail({
        to: user.email,
        template: "order-shipped",
        data: {
          name: user.name,
          orderNumber: order.orderNumber,
          trackingCompany: extra?.trackingCompany ?? "",
          trackingNumber: extra?.trackingNumber ?? "",
          orderUrl: `${env.SITE_URL}/orders/${order.orderNumber}`,
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
  if (to === "SHIPPED") {
    const tracking = extra?.trackingNumber
      ? `（${extra.trackingCompany ?? ""} ${extra.trackingNumber}）`
      : "";
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
        trackingCompany: extra?.trackingCompany ?? null,
        trackingNumber: extra?.trackingNumber ?? null,
      },
    });
  } else if (to === "DELIVERED") {
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

  return updated;
}

/**
 * 整单退款：admin 在后台把已支付订单直接置为 REFUNDED 时的统一入口。
 * 行为：
 *   1) 行锁订单 + 状态机校验（必须是已支付类）
 *   2) 发起 Stripe 退款（mock 模式跳过）
 *   3) 释放库存 + 销量回退
 *   4) 落库 Refund 记录（status=REFUNDED, gatewayRefundId 留痕）
 *   5) 资金流水 / 审计 / 邮件
 */
async function refundEntireOrder(order: OrderWithItems, actorId: string | null): Promise<Order> {
  // 网关侧退款（Stripe 模式）
  let gatewayRefundId: string | null = null;
  if (effectivePaymentMode === "stripe" && order.paymentId) {
    try {
      const r = await createStripeRefund(order.paymentId, Number(order.total));
      gatewayRefundId = r.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      throw new ApiError(502, "REFUND_FAILED", `网关退款失败：${msg}`);
    }
  }

  // 行锁 + 库存回补 + 落库 refund 记录 + 改订单状态
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
    // 条件更新：仅在原状态仍是可退款的中间态时推进
    const claimed = await tx.order.updateMany({
      where: {
        id: order.id,
        status: { in: ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] },
      },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ApiError(400, "BAD_REQUEST", "订单状态已变更，请刷新后重试");
    }

    // 库存回补（按扣减记录精确恢复）
    const productIds = [...new Set(order.items.map((i) => i.productId).filter((v): v is string => !!v))];
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
            data: {
              stock: { increment: restoreQty },
              soldCount: { decrement: item.quantity },
            },
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

    // 落 refund 记录（如果用户未单独走 /api/orders/[orderNumber]/refund，则补一条）
    const existing = await tx.refund.findFirst({
      where: { orderId: order.id, status: { in: ["REQUESTED", "APPROVED", "REFUNDED"] } },
    });
    if (!existing) {
      await tx.refund.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          reason: "管理员后台整单退款",
          amount: new Prisma.Decimal(Number(order.total).toFixed(2)),
          status: "REFUNDED",
          adminNote: actorId ? `actor=${actorId}` : null,
          gatewayRefundId,
        },
      });
    }

    return tx.order.findUnique({ where: { id: order.id }, include: { items: true } });
  });

  void logPayment({
    orderId: order.id,
    provider: effectivePaymentMode,
    event: "refunded",
    amount: Number(order.total),
    gatewayId: gatewayRefundId,
    payload: { source: "admin_status_change" },
  });

  // 邮件通知用户
  const user = await prisma.user.findUnique({ where: { id: order.userId } });
  if (user) {
    void sendMail({
      to: user.email,
      template: "refund-update",
      data: {
        name: user.name,
        orderNumber: order.orderNumber,
        statusText: "已退款（管理员操作）",
        amount: formatMoney(Number(order.total), order.currency),
        orderUrl: `${env.SITE_URL}/orders/${order.orderNumber}`,
      },
    });
  }

  await audit({
    userId: actorId ?? order.userId,
    action: "ORDER_REFUND_BY_ADMIN",
    entity: "Order",
    entityId: order.id,
    meta: { orderNumber: order.orderNumber, from: order.status, gatewayRefundId },
  });

  return updated!;
}

export async function getOrderByNumber(orderNumber: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });
  if (!order) throw notFound("订单不存在");
  return order;
}

export async function getOrderById(id: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) throw notFound("订单不存在");
  return order;
}

/** 用户订单所有权校验 */
export function assertOrderOwner(order: Order, userId: string): void {
  if (order.userId !== userId) throw new ApiError(403, "FORBIDDEN", "无权访问该订单");
}

export { assertTransition, toCents };
