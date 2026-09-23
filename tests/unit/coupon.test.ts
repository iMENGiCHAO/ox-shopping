import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  commitCouponRedemptionInTx,
  computeCouponDiscount,
  normalizeCouponCode,
  normalizeEmail,
} from "@/server/services/coupon.service";
import { ALL_ADMIN_NAV_ITEMS } from "@/lib/admin-nav";
import {
  COUPON_REASON_KEY,
  couponDescription,
  couponHeadline,
  couponMinSpendLabel,
  couponReasonMessage,
  couponTitle,
  type CouponRejectReason,
  type CouponView,
} from "@/lib/coupon";

/**
 * 折扣码纯逻辑回归。
 *
 * 这里只测**不碰数据库**的部分（减免计算 / 码规范化 / 文案映射），
 * 全链路（行锁核销、限量并发、取消回补）在 tests/integration/coupon-flow.test.ts。
 *
 * 金额口径：computeCouponDiscount 一律以**基础币种 USD** 计算，
 * 换算成结算币种是 order.service 的职责 —— 所以本文件的断言全部是 USD 数字。
 */

/** 只关心 type/value/maxDiscount 三个字段，其余字段与计算无关 */
function coupon(
  type: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING",
  value: number,
  maxDiscount: number | null = null,
) {
  return { type, value, maxDiscount } as unknown as Parameters<typeof computeCouponDiscount>[0];
}

describe("折扣码 · 减免计算", () => {
  describe("PERCENTAGE 百分比券", () => {
    it("按折前小计打折，运费不参与打折", () => {
      const r = computeCouponDiscount(coupon("PERCENTAGE", 20), {
        subtotalUsd: 100,
        shippingFeeUsd: 8,
      });
      expect(r.discountUsd).toBe(20);
      expect(r.freeShipping).toBe(false);
    });

    it("maxDiscount 封顶生效：高客单不会被大额百分比券打穿毛利", () => {
      // 50% × 1000 = 500，封顶 100 → 只减 100
      const r = computeCouponDiscount(coupon("PERCENTAGE", 50, 100), {
        subtotalUsd: 1000,
        shippingFeeUsd: 0,
      });
      expect(r.discountUsd).toBe(100);
    });

    it("未达封顶时不受 maxDiscount 影响", () => {
      const r = computeCouponDiscount(coupon("PERCENTAGE", 10, 100), {
        subtotalUsd: 200,
        shippingFeeUsd: 0,
      });
      expect(r.discountUsd).toBe(20);
    });

    it("减免额永不超过折前小计（不允许把订单打成负数）", () => {
      const r = computeCouponDiscount(coupon("PERCENTAGE", 100), {
        subtotalUsd: 50,
        shippingFeeUsd: 8,
      });
      expect(r.discountUsd).toBe(50);
    });

    it("小数金额按两位四舍五入（避免出现 4.9995000001 这类脏值）", () => {
      // 33.33 × 15% = 4.9995 → 5.00
      const r = computeCouponDiscount(coupon("PERCENTAGE", 15), {
        subtotalUsd: 33.33,
        shippingFeeUsd: 0,
      });
      expect(r.discountUsd).toBe(5);
    });

    it("小计为 0 时不产生减免", () => {
      const r = computeCouponDiscount(coupon("PERCENTAGE", 20), {
        subtotalUsd: 0,
        shippingFeeUsd: 8,
      });
      expect(r.discountUsd).toBe(0);
    });
  });

  describe("FIXED 固定额券", () => {
    it("直接减固定金额", () => {
      const r = computeCouponDiscount(coupon("FIXED", 10), { subtotalUsd: 100, shippingFeeUsd: 8 });
      expect(r.discountUsd).toBe(10);
    });

    it("面额大于小计时被夹到小计，不会倒找钱", () => {
      const r = computeCouponDiscount(coupon("FIXED", 200), { subtotalUsd: 50, shippingFeeUsd: 8 });
      expect(r.discountUsd).toBe(50);
    });

    it("面额等于小计时减到 0，不产生负数", () => {
      const r = computeCouponDiscount(coupon("FIXED", 50), { subtotalUsd: 50, shippingFeeUsd: 0 });
      expect(r.discountUsd).toBe(50);
    });
  });

  describe("FREE_SHIPPING 免邮券", () => {
    it("减免额 = 本单运费，并置 freeShipping 标记", () => {
      const r = computeCouponDiscount(coupon("FREE_SHIPPING", 0), {
        subtotalUsd: 100,
        shippingFeeUsd: 8.5,
      });
      expect(r.discountUsd).toBe(8.5);
      expect(r.freeShipping).toBe(true);
    });

    it("本就免邮时减免为 0（由 evaluateCoupon 判为 NOT_APPLICABLE，不假装已优惠）", () => {
      const r = computeCouponDiscount(coupon("FREE_SHIPPING", 0), {
        subtotalUsd: 100,
        shippingFeeUsd: 0,
      });
      expect(r.discountUsd).toBe(0);
      expect(r.freeShipping).toBe(true);
    });
  });

  describe("脏数据防御", () => {
    it("负数小计/运费按 0 处理，不产生负减免（负减免等于给用户加价）", () => {
      const r = computeCouponDiscount(coupon("PERCENTAGE", 20), {
        subtotalUsd: -100,
        shippingFeeUsd: -8,
      });
      expect(r.discountUsd).toBe(0);
      expect(r.discountUsd).toBeGreaterThanOrEqual(0);
    });

    it("未知券类型返回 0 减免（不抛异常，避免把结账页打崩）", () => {
      const r = computeCouponDiscount(coupon("BOGUS" as never, 10), {
        subtotalUsd: 100,
        shippingFeeUsd: 8,
      });
      expect(r.discountUsd).toBe(0);
      expect(r.freeShipping).toBe(false);
    });
  });

  it("金额恒等式可成立：total = subtotal + shipping − discount ≥ 0", () => {
    const subtotal = 37.5;
    const shipping = 8;
    const r = computeCouponDiscount(coupon("PERCENTAGE", 80, 20), {
      subtotalUsd: subtotal,
      shippingFeeUsd: shipping,
    });
    const total = subtotal + shipping - r.discountUsd;
    expect(r.discountUsd).toBeLessThanOrEqual(subtotal);
    expect(total).toBeGreaterThanOrEqual(0);
  });
});

describe("折扣码 · 核销金额币种", () => {
  it("落库读取 Order.discount，而不是把 USD 参数写进非 USD 订单", async () => {
    const create = vi.fn().mockResolvedValue({});
    const tx = {
      coupon: { update: vi.fn().mockResolvedValue({}) },
      order: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ discount: new Prisma.Decimal("42.42") }),
      },
      couponRedemption: { create },
    } as unknown as Prisma.TransactionClient;

    await commitCouponRedemptionInTx(tx, {
      couponId: "coupon-1",
      orderId: "order-1",
      discountUsd: 5,
    });

    expect(create).toHaveBeenCalledOnce();
    const data = create.mock.calls[0]![0].data as { discountAmount: Prisma.Decimal };
    expect(Number(data.discountAmount)).toBe(42.42);
  });
});

describe("折扣码 · 码与邮箱规范化", () => {
  it("券码去空白 + 转大写（库里统一存大写，避免大小写导致「查不到券」）", () => {
    expect(normalizeCouponCode("  save20 ")).toBe("SAVE20");
    expect(normalizeCouponCode("save20")).toBe("SAVE20");
    expect(normalizeCouponCode("SaVe20")).toBe("SAVE20");
  });

  it("空券码规范化为空串（由调用方判为 NOT_FOUND）", () => {
    expect(normalizeCouponCode("   ")).toBe("");
  });

  it("邮箱统一小写去空白，保证游客的「每人限次」稳定", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
    // 同一邮箱不同写法必须归一，否则可绕过每人限次
    expect(normalizeEmail("A@b.com")).toBe(normalizeEmail(" a@B.COM "));
  });
});

describe("后台消息中心导航", () => {
  it("消息中心对 SUPPORT 可见，与 requireStaff API 权限一致", () => {
    const item = ALL_ADMIN_NAV_ITEMS.find((entry) => entry.href === "/admin/notifications");
    expect(item).toBeDefined();
    expect(item?.adminOnly).not.toBe(true);
  });
});

describe("折扣码 · 文案映射", () => {
  const t = (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key;

  it("每个原因码都有文案键，不存在空文案", () => {
    const reasons = Object.keys(COUPON_REASON_KEY) as CouponRejectReason[];
    expect(reasons.length).toBe(8);
    for (const r of reasons) {
      expect(COUPON_REASON_KEY[r]).toBeTruthy();
      expect(couponReasonMessage(r, t)).toBeTruthy();
    }
  });

  it("MIN_SPEND 带差额时使用专用文案，不带差额时回退通用文案", () => {
    expect(couponReasonMessage("MIN_SPEND", t, "$12.00")).toBe(
      'Spend {amount} more to use this discount code|{"amount":"$12.00"}',
    );
    expect(couponReasonMessage("MIN_SPEND", t)).toBe(COUPON_REASON_KEY.MIN_SPEND);
  });

  it("couponHeadline 按券类型给出主卖点，且不拼货币符号（币种由 formatMoney 决定）", () => {
    const money = (n: number) => `MONEY(${n})`;
    expect(couponHeadline({ type: "PERCENTAGE", value: 20 }, t, money)).toBe(
      '{pct}% off|{"pct":"20"}',
    );
    expect(couponHeadline({ type: "FIXED", value: 10 }, t, money)).toBe(
      'Save {amount}|{"amount":"MONEY(10)"}',
    );
    expect(couponHeadline({ type: "FREE_SHIPPING", value: 0 }, t, money)).toBe(
      "Free shipping on your order",
    );
  });

  it("couponMinSpendLabel：无门槛返回 null，有门槛返回带金额的提示", () => {
    const money = (n: number) => `MONEY(${n})`;
    expect(couponMinSpendLabel({ minSpend: 0 }, t, money)).toBeNull();
    expect(couponMinSpendLabel({ minSpend: 50 }, t, money)).toBe(
      'Min. spend {amount}|{"amount":"MONEY(50)"}',
    );
  });

  it("标题/说明按语言取值，缺失时逐级回退（zh → en → 券码 / 空串）", () => {
    // CouponView 是全量结构，用一个工厂避免每条断言都手写一堆无关字段
    const view = (over: Partial<CouponView> = {}): CouponView => ({
      code: "SAVE20",
      type: "PERCENTAGE",
      value: 20,
      minSpend: 0,
      maxDiscount: null,
      endsAt: new Date(),
      title: "满减",
      titleEn: "Save 20",
      description: null,
      descriptionEn: "desc",
      ...over,
    });

    const c = view();
    expect(couponTitle(c, "zh")).toBe("满减");
    expect(couponTitle(c, "en")).toBe("Save 20");
    expect(couponDescription(c, "zh")).toBe("desc"); // zh 缺失 → 回退 en
    expect(couponDescription(c, "en")).toBe("desc");
    // 两者都缺 → 标题回退券码、说明回退空串
    expect(couponTitle(view({ title: null, titleEn: null }), "en")).toBe("SAVE20");
    expect(couponDescription(view({ description: null, descriptionEn: null }), "en")).toBe("");
    // 只有 zh 有值时，en 侧也要能拿到（避免英文站出现空标题）
    expect(couponTitle(view({ titleEn: null }), "en")).toBe("满减");
    expect(couponTitle(view({ title: null }), "zh")).toBe("Save 20");
  });
});
