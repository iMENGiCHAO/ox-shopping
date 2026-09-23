import "server-only";
import { Prisma, type Coupon, type CouponType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CouponRejectReason } from "@/lib/coupon";

/**
 * 折扣码（优惠券）服务。
 *
 * 金额口径（务必与 order.service 保持一致，否则会出现「结算页一个价、扣款另一个价」）：
 *   - 券的 value / minSpend / maxDiscount 一律以**基础币种 USD** 存储；
 *   - 校验与减免计算全部在 USD 维度完成，最后由 order.service 统一换算为用户结算币种；
 *   - 订单金额恒等式：`total = subtotal + shippingFee + tax − discount`。
 *     FREE_SHIPPING 券的减免额 = 该单运费，因此 net 运费为 0，且 discount 有据可查。
 *
 * 核销语义：
 *   - 核销发生在下单事务内，并对 coupons 行加 `FOR UPDATE` 行锁，
 *     使「限量券」在并发下不会超发（与商品库存的防超卖同一套路）。
 *   - coupon_redemptions 上的 @@unique([couponId, orderId]) 是幂等键，
 *     同一订单重复核销直接命中唯一约束，不会重复计数。
 *   - 订单取消/退款时回补 usedCount 并删除核销记录，券可再次使用。
 */

/** 券校验失败原因。文案不在此层拼装——见 @/lib/coupon 的原因码→词典键映射。 */
export type { CouponRejectReason };

export interface CouponEvaluation {
  ok: boolean;
  reason?: CouponRejectReason;
  /** MIN_SPEND 未达标时还差多少（USD），用于提示「再买 X 元可用」 */
  shortfallUsd?: number;
  coupon?: Coupon;
  /** 减免总额（USD）。FREE_SHIPPING 时为被免除的运费。 */
  discountUsd: number;
  /** 是否免运费券 */
  freeShipping: boolean;
}

/** 统一的券码规范化：去空白 + 转大写（库里统一存大写） */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

export interface CouponAmounts {
  /** 折前商品小计（USD） */
  subtotalUsd: number;
  /** 折前运费（USD；货到付款与已免邮时为 0） */
  shippingFeeUsd: number;
}

/**
 * 纯函数：按券类型算出减免额。
 * 不做任何 DB 读取，便于单测与在事务内复用（事务里传的是锁定后的最新金额）。
 */
export function computeCouponDiscount(
  coupon: Pick<Coupon, "type" | "value" | "maxDiscount">,
  amounts: CouponAmounts,
): { discountUsd: number; freeShipping: boolean } {
  const subtotal = Math.max(0, amounts.subtotalUsd);
  const shipping = Math.max(0, amounts.shippingFeeUsd);

  switch (coupon.type as CouponType) {
    case "PERCENTAGE": {
      const pct = Number(coupon.value);
      let off = round2((subtotal * pct) / 100);
      // 百分比券的封顶：防止高客单被大额百分比券打穿毛利
      if (coupon.maxDiscount != null) {
        off = Math.min(off, Number(coupon.maxDiscount));
      }
      // 减免不得超过折前小计（不允许把订单打成负数）
      return { discountUsd: Math.min(off, subtotal), freeShipping: false };
    }
    case "FIXED": {
      const off = Number(coupon.value);
      return { discountUsd: Math.min(off, subtotal), freeShipping: false };
    }
    case "FREE_SHIPPING": {
      // 免邮券：减免额 = 本单运费。运费本就为 0 时无实际优惠（由调用方判为 NOT_APPLICABLE）。
      return { discountUsd: shipping, freeShipping: true };
    }
    default: {
      return { discountUsd: 0, freeShipping: false };
    }
  }
}

/** 券的有效期/状态校验（与「谁在用」无关的部分） */
function checkCouponWindow(coupon: Coupon, now: Date): CouponRejectReason | null {
  if (!coupon.isActive) return "INACTIVE";
  if (coupon.startsAt > now) return "NOT_STARTED";
  if (coupon.endsAt < now) return "EXPIRED";
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return "USAGE_LIMIT";
  return null;
}

/**
 * 只读校验：结账页「应用」按钮用。不做核销、不写库。
 *
 * @param holder 券的持有人身份。登录单传 userId，游客单传 email。
 *               用于「每人限次」判定——两者都为空时跳过该判定（调用方应避免这种情况）。
 */
export async function evaluateCoupon(
  rawCode: string,
  amounts: CouponAmounts,
  holder: { userId?: string | null; email?: string | null },
): Promise<CouponEvaluation> {
  const code = normalizeCouponCode(rawCode);
  const zero: CouponEvaluation = { ok: false, discountUsd: 0, freeShipping: false };
  if (!code) return { ...zero, reason: "NOT_FOUND" };

  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon) return { ...zero, reason: "NOT_FOUND" };

  const now = new Date();
  const windowReason = checkCouponWindow(coupon, now);
  if (windowReason) return { ...zero, reason: windowReason, coupon };

  // 使用门槛按**折前**小计判定（与免邮门槛同口径，避免「先减免后不够门槛」的争议）
  const minSpend = Number(coupon.minSpend);
  if (minSpend > 0 && amounts.subtotalUsd < minSpend) {
    return {
      ...zero,
      reason: "MIN_SPEND",
      shortfallUsd: round2(minSpend - amounts.subtotalUsd),
      coupon,
    };
  }

  // 每人限次：登录单按 userId，游客单按邮箱；两者皆空则不限制
  if (coupon.perUserLimit > 0) {
    const identity = holder.userId
      ? { userId: holder.userId }
      : holder.email
        ? { email: normalizeEmail(holder.email) }
        : null;
    if (identity) {
      const used = await prisma.couponRedemption.count({
        where: { couponId: coupon.id, ...identity },
      });
      if (used >= coupon.perUserLimit) return { ...zero, reason: "PER_USER_LIMIT", coupon };
    }
  }

  const { discountUsd, freeShipping } = computeCouponDiscount(coupon, amounts);
  // 无实际优惠（如免邮券碰上本就免邮的单）——明确拒绝，避免用户以为已享优惠
  if (discountUsd <= 0) return { ...zero, reason: "NOT_APPLICABLE", coupon };

  return { ok: true, coupon, discountUsd, freeShipping };
}

/** 邮箱口径统一为小写去空白，保证「每人限次」对游客也稳定 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface RedeemResult {
  couponId: string;
  couponCode: string;
  /** 减免总额（USD） */
  discountUsd: number;
  freeShipping: boolean;
}

/**
 * 事务内**锁定并算价**（不写核销记录）。
 *
 * 必须拆成「锁价」与「落核销」两步：核销记录需要 orderId，而订单总额又需要先知道
 * 减免额——只能先锁价算钱、建单拿到 id、再落核销。两步都必须在同一个事务里。
 *
 * 流程：
 *   1) 对 coupons 行加 FOR UPDATE 行锁（限量券并发安全，与商品库存防超卖同一套路）
 *   2) 锁定后**重新**校验有效期 / 总量 / 每人限次（防「预览通过、下单时已被抢完」）
 *
 * 校验不通过时抛 CouponRejectError，由调用方翻译为面向用户的文案。
 */
export async function lockCouponInTx(
  tx: Prisma.TransactionClient,
  params: {
    code: string;
    amounts: CouponAmounts;
    holder: { userId?: string | null; email?: string | null };
  },
): Promise<RedeemResult> {
  const code = normalizeCouponCode(params.code);

  // 行锁：串行化同券的并发核销
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM coupons WHERE code = ${code} FOR UPDATE
  `;
  if (locked.length === 0) throw new CouponRejectError("NOT_FOUND", code);

  const coupon = await tx.coupon.findUnique({ where: { code } });
  if (!coupon) throw new CouponRejectError("NOT_FOUND", code);

  const now = new Date();
  const windowReason = checkCouponWindow(coupon, now);
  if (windowReason) throw new CouponRejectError(windowReason, code);

  const minSpend = Number(coupon.minSpend);
  if (minSpend > 0 && params.amounts.subtotalUsd < minSpend) {
    throw new CouponRejectError("MIN_SPEND", code, round2(minSpend - params.amounts.subtotalUsd));
  }

  if (coupon.perUserLimit > 0) {
    const identity = params.holder.userId
      ? { userId: params.holder.userId }
      : params.holder.email
        ? { email: normalizeEmail(params.holder.email) }
        : null;
    if (identity) {
      const used = await tx.couponRedemption.count({
        where: { couponId: coupon.id, ...identity },
      });
      if (used >= coupon.perUserLimit) throw new CouponRejectError("PER_USER_LIMIT", code);
    }
  }

  const { discountUsd, freeShipping } = computeCouponDiscount(coupon, params.amounts);
  if (discountUsd <= 0) throw new CouponRejectError("NOT_APPLICABLE", code);

  return { couponId: coupon.id, couponCode: coupon.code, discountUsd, freeShipping };
}

/**
 * 事务内落核销记录：usedCount + 1 并写 coupon_redemptions。
 * 唯一键 (couponId, orderId) 保证同一订单重复调用只会成功一次（幂等）。
 *
 * `CouponRedemption.discountAmount` 的 schema 口径是**订单币种**。下单事务里
 * `discountUsd` 仍是基础币种金额，直接写它会让 CNY/EUR 等订单的核销记录金额
 * 错成 USD。这里以同一事务内刚落库的 `Order.discount` 为权威值；USD 参数仅作
 * 异常数据兜底，避免调用方尚未写 order discount 的旧集成产生非法金额。
 */
export async function commitCouponRedemptionInTx(
  tx: Prisma.TransactionClient,
  params: {
    couponId: string;
    userId?: string | null;
    email?: string | null;
    orderId: string;
    /** 实际减免额（USD） */
    discountUsd: number;
  },
): Promise<void> {
  await tx.coupon.update({
    where: { id: params.couponId },
    data: { usedCount: { increment: 1 } },
  });
  const order = await tx.order.findUniqueOrThrow({
    where: { id: params.orderId },
    select: { discount: true },
  });
  const orderDiscount = Number(order.discount);
  const discountAmount = Number.isFinite(orderDiscount) ? orderDiscount : params.discountUsd;

  await tx.couponRedemption.create({
    data: {
      couponId: params.couponId,
      userId: params.userId ?? null,
      email: params.email ? normalizeEmail(params.email) : null,
      orderId: params.orderId,
      // 与 Order.currency 配套：这里存订单币种金额，而不是传入的 USD 基础金额。
      discountAmount: dec(discountAmount),
    },
  });
}

/**
 * 事务内一次性核销（锁价 + 落记录）。适用于调用方已有 orderId 的场景。
 */
export async function redeemCouponInTx(
  tx: Prisma.TransactionClient,
  params: {
    code: string;
    amounts: CouponAmounts;
    holder: { userId?: string | null; email?: string | null };
    orderId: string;
  },
): Promise<RedeemResult> {
  const result = await lockCouponInTx(tx, {
    code: params.code,
    amounts: params.amounts,
    holder: params.holder,
  });
  await commitCouponRedemptionInTx(tx, {
    couponId: result.couponId,
    userId: params.holder.userId,
    email: params.holder.email,
    orderId: params.orderId,
    discountUsd: result.discountUsd,
  });
  return result;
}

/**
 * 事务内回补：订单取消/退款时把券还回去（usedCount − 1，删除核销记录）。
 * 幂等：核销记录不存在时不做任何事，重复调用安全。
 */
export async function restoreCouponInTx(
  tx: Prisma.TransactionClient,
  order: { id: string; couponId: string | null },
): Promise<void> {
  if (!order.couponId) return;
  const redemption = await tx.couponRedemption.findUnique({
    where: { couponId_orderId: { couponId: order.couponId, orderId: order.id } },
  });
  if (!redemption) return;
  await tx.couponRedemption.delete({ where: { id: redemption.id } });
  // usedCount 下限保护：历史数据异常时不至于出现负数
  await tx.$executeRaw`
    UPDATE coupons SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE id = ${order.couponId}
  `;
}

/** 校验失败异常：携带原因码与可选差额，便于上层本地化 */
export class CouponRejectError extends Error {
  readonly reason: CouponRejectReason;
  readonly code: string;
  readonly shortfallUsd?: number;

  constructor(reason: CouponRejectReason, code: string, shortfallUsd?: number) {
    super(`Coupon rejected: ${reason}`);
    this.name = "CouponRejectError";
    this.reason = reason;
    this.code = code;
    this.shortfallUsd = shortfallUsd;
  }
}

/** 面向用户展示的券信息（不含内部统计字段） */
export interface PublicCoupon {
  code: string;
  type: CouponType;
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  endsAt: Date;
  title: string | null;
  titleEn: string | null;
  description: string | null;
  descriptionEn: string | null;
}

/** 公开领券页：当前可领取/可用的公开券（在有效期内、未抢完） */
export async function listPublicCoupons(): Promise<PublicCoupon[]> {
  const now = new Date();
  const rows = await prisma.coupon.findMany({
    where: {
      isActive: true,
      isPublic: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: [{ endsAt: "asc" }, { createdAt: "desc" }],
  });
  // 抢完的券不展示（usageLimit=0 表示不限量）
  return rows.filter((c) => c.usageLimit === 0 || c.usedCount < c.usageLimit).map(toPublicCoupon);
}

function toPublicCoupon(c: Coupon): PublicCoupon {
  return {
    code: c.code,
    type: c.type,
    value: Number(c.value),
    minSpend: Number(c.minSpend),
    maxDiscount: c.maxDiscount == null ? null : Number(c.maxDiscount),
    endsAt: c.endsAt,
    title: c.title,
    titleEn: c.titleEn,
    description: c.description,
    descriptionEn: c.descriptionEn,
  };
}

/** 「我的折扣码」列表行：券信息 + 该用户的核销事实 */
export interface UserRedemptionRow {
  id: string;
  /** 实际减免金额（**订单币种**，展示时必须配 currency） */
  discountAmount: number;
  currency: string;
  createdAt: Date;
  orderNumber: string;
  coupon: PublicCoupon & { id: string; startsAt: Date };
}

/**
 * 某用户的核销记录（「我的折扣码 · 已使用」列表）。
 *
 * 展示金额以关联订单的 `discount` 为权威值并搭配 `order.currency`：这既符合
 * CouponRedemption.discountAmount 的订单币种口径，也能兼容旧版本曾误存 USD
 * 数字的历史核销行，避免给 CNY/EUR 订单显示相差数倍的「已省金额」。
 */
export async function listUserRedemptions(userId: string, take = 50): Promise<UserRedemptionRow[]> {
  const rows = await prisma.couponRedemption.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      coupon: true,
      order: { select: { orderNumber: true, currency: true, discount: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    // 兼容旧数据：旧实现可能把 USD 数字写进本应存订单币种的字段。
    // Order.discount 是下单时按汇率分配后的权威金额，始终与 order.currency 配套。
    discountAmount: Number(r.order.discount),
    currency: r.order.currency,
    createdAt: r.createdAt,
    orderNumber: r.order.orderNumber,
    coupon: { ...toPublicCoupon(r.coupon), id: r.coupon.id, startsAt: r.coupon.startsAt },
  }));
}
