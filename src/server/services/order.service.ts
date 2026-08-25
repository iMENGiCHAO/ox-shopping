import "server-only";
import { Prisma } from "@prisma/client";
import type { Order, OrderItem, OrderStatus, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  FREE_SHIPPING_THRESHOLD,
  ORDER_EXPIRE_SECONDS,
  SHIPPING_FEE,
  TAX_RATE,
} from "@/lib/constants";
import { generateOrderNumber, toCents } from "@/lib/utils";
import { ApiError, badRequest, notFound } from "@/lib/errors";
import { assertTransition, canTransition } from "@/lib/order-status";
import { sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { createCheckoutSession } from "@/lib/payment/stripe";
import { createMockPaymentUrl } from "@/lib/payment/mock";
import { effectivePaymentMode } from "@/lib/env";
import type { SpecSelection } from "@/server/services/cart.service";

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
  shippingMethod: "standard" | "express";
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
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  const address = await prisma.address.findFirst({
    where: { id: input.addressId, userId: input.userId },
  });
  if (!address) throw badRequest("收货地址不存在");

  const subtotal = round2(
    input.items.reduce(
      (s, i) => s.add(d(Number(productById.get(i.productId)!.price) * i.quantity)),
      new Prisma.Decimal(0),
    ),
  );

  // Discount券
  let discount = 0;
  let freeShipping = false;
  let couponId: string | null = null;
  if (input.couponCode) {
    const coupon = await findUsableCoupon(input.couponCode, input.userId);
    couponId = coupon.id;
    const baseShipping = input.shippingMethod === "express" ? SHIPPING_FEE * 2 : SHIPPING_FEE;
    const result = computeCouponDiscount(coupon, subtotal, baseShipping);
    discount = result.discount;
    freeShipping = result.freeShipping;
  }

  // Shipping与税费
  let shippingFee = input.shippingMethod === "express" ? SHIPPING_FEE * 2 : SHIPPING_FEE;
  if (freeShipping || subtotal - discount >= FREE_SHIPPING_THRESHOLD) {
    shippingFee = 0;
  }
  const tax = round2(d(Math.round((subtotal - discount) * TAX_RATE * 100) / 100));
  const total = round2(
    new Prisma.Decimal(0).add(d(subtotal)).sub(d(discount)).add(d(shippingFee)).add(d(tax)),
  );
  if (total < 0) throw badRequest("订单金额异常");

  const orderNumber = generateOrderNumber();

  const order = await prisma.$transaction(async (tx) => {
    // 1. 原子扣库存(防超卖：stock >= quantity 条件更新)
    for (const item of input.items) {
      const product = productById.get(item.productId)!;
      if (product.isPresale) {
        // 预售：允许 0 库存下单，库存只减不穿(下限 0)，销量照常累计
        await tx.$executeRaw`UPDATE products SET stock = GREATEST(stock - ${item.quantity}, 0), "soldCount" = "soldCount" + ${item.quantity} WHERE id = ${item.productId} AND status = 'ACTIVE'`;
        continue;
      }
      const updated = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity }, status: "ACTIVE" },
        data: {
          stock: { decrement: item.quantity },
          soldCount: { increment: item.quantity },
        },
      });
      if (updated.count === 0) {
        throw badRequest(`「${product.name}」库存不足，仅剩 ${product.stock} 件`);
      }
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
          create: input.items.map((item) => {
            const p = productById.get(item.productId)!;
            const price = Number(p.price);
            return {
              productId: p.id,
              productName: p.name,
              productImage: Array.isArray(p.images) ? ((p.images[0] as string) ?? null) : null,
              sku: p.sku,
              price: d(price),
              quantity: item.quantity,
              subtotal: d(Math.round(price * item.quantity * 100) / 100),
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
    meta: { orderNumber, total },
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
    return createCheckoutSession(
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
  }
  return createMockPaymentUrl(order.orderNumber);
}

/** 标记订单已支付(Webhook / 模拟支付共用；幂等) */
export async function markOrderPaid(
  orderNumber: string,
  paymentId?: string,
): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });
  if (!order) throw notFound("订单不存在");
  if (order.status === "PAID" || order.status !== "PENDING_PAYMENT") return order;

  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentId: paymentId ?? order.paymentId,
      },
      include: { items: true },
    });
    // 支付成功后Discount券使用量 +1
    await tx.couponRedemption
      .findMany({ where: { orderId: order.id } })
      .then((rs) =>
        Promise.all(
          rs.map((r) =>
            tx.coupon.update({ where: { id: r.couponId }, data: { usedCount: { increment: 1 } } }),
          ),
        ),
      );
    return o;
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

  return updated;
}

/** 取消订单(恢复库存) */
export async function cancelOrder(order: Order, byUserId?: string | null): Promise<Order> {
  if (order.status !== "PENDING_PAYMENT") {
    throw badRequest("当前状态不可取消");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      include: { items: true },
    });
    for (const item of o.items) {
      if (!item.productId) continue;
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
          soldCount: { decrement: item.quantity },
        },
      });
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

/** 订单状态修改(状态机校验 + 事件时间戳 + 通知) */
export async function updateOrderStatus(
  order: OrderWithItems,
  to: OrderStatus,
  actor: { id: string; name: string } | null,
  extra?: { trackingCompany?: string; trackingNumber?: string },
): Promise<Order> {
  if (!canTransition(order.status, to)) {
    throw new ApiError(400, "BAD_REQUEST", `不允许从「${order.status}」变更为「${to}」`);
  }

  const data: Prisma.OrderUpdateInput = { status: to };
  if (to === "SHIPPED") {
    data.shippedAt = new Date();
    data.trackingCompany = extra?.trackingCompany ?? null;
    data.trackingNumber = extra?.trackingNumber ?? null;
  }
  if (to === "DELIVERED") data.deliveredAt = new Date();
  if (to === "CANCELLED") data.cancelledAt = new Date();
  if (to === "REFUNDED") data.refundedAt = new Date();
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

  return updated;
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
