import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { callApi, getData, login, testClientKey } from "../helpers/api";
import { resetRateLimit } from "@/lib/rate-limit";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";

/**
 * 折扣码全链路 + 游客结账集成测试。
 *
 * 为什么这两件事放在一个文件：券的「每人限次」对登录单按 userId、对游客单按
 * contactEmail 统计，游客路径**只有**在券的语境下才可能出错（邮箱归一化、null userId），
 * 拆成两个文件就覆盖不到这个交叉点。
 *
 * 覆盖的核心不变量：
 *   1. 试算（/api/coupons/apply）是只读的 —— 不能因为用户点了「应用」就扣掉限量券的名额
 *   2. 核销必须发生在下单事务里，且 usedCount / 核销记录 / 订单折扣三者一致
 *   3. 金额恒等式 total = subtotal + shippingFee + tax − discount 必须成立
 *   4. 取消订单要**回补**券（否则用户的券会被白吃掉）
 *   5. 游客单同样受每人限次约束，且大小写不同的邮箱视为同一人
 *
 * 金额口径：券的 value/minSpend/maxDiscount 存的是**基础币种 USD**；
 * 断言里若涉及订单金额，需注意订单可能按结算币种落库（本文件统一用 USD 请求）。
 */

/** 本文件创建的券统一前缀，便于清理且不与人工数据冲突 */
const CODE_PREFIX = "QA-COUPON-";

function cookiesOf(jar: { get: (n: string) => string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const v = jar.get(n);
    if (v) out[n] = v;
  }
  return out;
}

/** 测试客户端固定带 x-forwarded-for: 127.0.0.1，但非生产环境下 TRUST_PROXY=false，
 *  getClientIp 会忽略 XFF 返回 "unknown"。两种取值都重置，避免依赖环境。 */
async function resetLimits(userId?: string) {
  // 含 testClientKey()：B1 修复后无信任 IP 时标识是请求头指纹（不再是常量 "unknown"）
  for (const ip of ["127.0.0.1", "unknown", testClientKey()]) {
    await resetRateLimit(`order-create-ip:${ip}`);
    await resetRateLimit(`coupon-apply-ip:${ip}`);
  }
  if (userId) {
    await resetRateLimit(`order-create:${userId}`);
    await resetRateLimit(`coupon-apply:${userId}`);
  }
}

/** 造一张券。默认：无门槛、不封顶、不限总量、每人 1 次、长期有效 */
async function makeCoupon(opts: {
  code: string;
  type: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  value: number;
  minSpend?: number;
  maxDiscount?: number | null;
  usageLimit?: number;
  perUserLimit?: number;
  isActive?: boolean;
  startsAt?: Date;
  endsAt?: Date;
}) {
  return prisma.coupon.create({
    data: {
      code: opts.code.toUpperCase(),
      type: opts.type,
      value: opts.value,
      minSpend: opts.minSpend ?? 0,
      maxDiscount: opts.maxDiscount ?? null,
      usageLimit: opts.usageLimit ?? 0,
      perUserLimit: opts.perUserLimit ?? 1,
      isActive: opts.isActive ?? true,
      startsAt: opts.startsAt ?? new Date(Date.now() - 86_400_000),
      endsAt: opts.endsAt ?? new Date(Date.now() + 86_400_000),
    },
  });
}

let productId: string;
let productPrice: number;
let addressId: string;
let userId: string;
let jar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };
/** standard 物流的运费与免邮门槛，从 DB 读，避免把业务参数写死在测试里 */
let shippingFee: number;
let freeOver: number;

const GUEST_ADDRESS = {
  country: "US",
  firstName: "Guest",
  lastName: "Buyer",
  line1: "1 Rocket Road",
  city: "Hawthorne",
  state: "CA",
  postalCode: "90250",
};

/**
 * 库存基线。
 *
 * 种子对商品用的是 `update: {}`（刻意非破坏，绝不覆盖人工改过的价格/库存），
 * 这意味着**库存会跨测试轮次单调递减**——今天靠 `stock > 10` 通过的用例，
 * 早晚会因为库存被前面几轮跑干而假失败。所以这里不再只「挑一个库存够的商品」，
 * 而是挑完之后把库存抬到基线：只升不降，既让本文件可重复运行，也不会踩到别的用例。
 */
const STOCK_BASELINE = 500;

beforeAll(async () => {
  // 清掉上次运行残留的券（级联删除核销记录）
  await prisma.coupon.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });

  const product = await prisma.product.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { stock: "desc" },
  });
  productId = product.id;
  productPrice = Number(product.price);
  if (product.stock < STOCK_BASELINE) {
    await prisma.product.update({ where: { id: productId }, data: { stock: STOCK_BASELINE } });
  }

  const user = await prisma.user.findFirstOrThrow({ where: { email: "user@example.com" } });
  userId = user.id;

  const address = await prisma.address.findFirst({ where: { userId } });
  addressId = address!.id;

  const method = await prisma.shippingMethod.findFirstOrThrow({ where: { code: "standard" } });
  shippingFee = Number(method.fee);
  freeOver = Number(method.freeOver);

  const l = await login("user@example.com", "User@123456");
  jar = l.jar;
  // 这个钩子要跑 6 次 DB 往返 + 一次登录（bcrypt 校验）。外置卷上全量运行时
  // 争用很大，vitest 默认 90s 的 hookTimeout 实测会被击穿（报
  // 「Hook timed out in 90000ms」并整文件 skip）。按实际开销显式放宽。
}, 240_000);

beforeEach(async () => {
  await resetLimits(userId);
});

describe("折扣码 · 试算是只读的", () => {
  it("应用成功返回减免额，但**不**扣减券的名额", async () => {
    const code = `${CODE_PREFIX}READONLY`;
    const coupon = await makeCoupon({ code, type: "PERCENTAGE", value: 10, usageLimit: 1 });

    const { POST } = await import("@/app/api/coupons/apply/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: { code, items: [{ productId, quantity: 1 }], shippingMethod: "standard" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { ok: boolean; quote: { discountUsd: number; coupon: { code: string } | null } };
    };
    expect(body.data.ok).toBe(true);
    expect(body.data.quote.coupon?.code).toBe(code);
    expect(body.data.quote.discountUsd).toBeGreaterThan(0);

    // 关键：试算不能有副作用，否则「点一下应用」就把限量券烧掉了
    const after = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(after.usedCount).toBe(0);
    expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(0);
  });

  it("券码大小写不敏感、前后空格可容忍", async () => {
    const code = `${CODE_PREFIX}CASE`;
    await makeCoupon({ code, type: "FIXED", value: 5 });

    const { POST } = await import("@/app/api/coupons/apply/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: { code: `  ${code.toLowerCase()}  `, items: [{ productId, quantity: 1 }] },
    });
    const body = (await res.json()) as { data: { ok: boolean } };
    expect(body.data.ok).toBe(true);
  });

  it("未达门槛返回 MIN_SPEND + 差额，而不是笼统失败", async () => {
    const code = `${CODE_PREFIX}MINSPEND`;
    await makeCoupon({ code, type: "FIXED", value: 5, minSpend: productPrice * 3 + 50 });

    const { POST } = await import("@/app/api/coupons/apply/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: { code, items: [{ productId, quantity: 1 }] },
    });
    const body = (await res.json()) as {
      data: { ok: boolean; reason: string; shortfallUsd: number | null };
    };
    expect(body.data.ok).toBe(false);
    expect(body.data.reason).toBe("MIN_SPEND");
    expect(body.data.shortfallUsd).toBeGreaterThan(0);
  });

  it("不存在的码 / 已停用 / 已过期 / 未开始 各有独立原因码", async () => {
    const { POST } = await import("@/app/api/coupons/apply/route");
    const apply = async (code: string) => {
      const res = await callApi(POST, {
        method: "POST",
        cookies: cookiesOf(jar),
        body: { code, items: [{ productId, quantity: 1 }] },
      });
      return ((await res.json()) as { data: { reason?: string } }).data.reason;
    };

    await makeCoupon({ code: `${CODE_PREFIX}OFF`, type: "FIXED", value: 5, isActive: false });
    await makeCoupon({
      code: `${CODE_PREFIX}PAST`,
      type: "FIXED",
      value: 5,
      startsAt: new Date(Date.now() - 172_800_000),
      endsAt: new Date(Date.now() - 86_400_000),
    });
    await makeCoupon({
      code: `${CODE_PREFIX}SOON`,
      type: "FIXED",
      value: 5,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 172_800_000),
    });

    expect(await apply(`${CODE_PREFIX}NOPE`)).toBe("NOT_FOUND");
    expect(await apply(`${CODE_PREFIX}OFF`)).toBe("INACTIVE");
    expect(await apply(`${CODE_PREFIX}PAST`)).toBe("EXPIRED");
    expect(await apply(`${CODE_PREFIX}SOON`)).toBe("NOT_STARTED");
  });

  it("免邮券：运费可收时减免额等于运费；本就免邮时判为不可用（不假装已优惠）", async () => {
    const code = `${CODE_PREFIX}SHIP`;
    await makeCoupon({ code, type: "FREE_SHIPPING", value: 0 });

    const { POST } = await import("@/app/api/coupons/apply/route");
    const { quoteOrderAmounts } = await import("@/server/services/order.service");

    /** 带券试算：走 HTTP 层，验证接口契约 */
    const applyWithCoupon = async (quantity: number) => {
      const res = await callApi(POST, {
        method: "POST",
        cookies: cookiesOf(jar),
        body: { code, items: [{ productId, quantity }], shippingMethod: "standard" },
      });
      return (
        (await res.json()) as {
          data: {
            ok: boolean;
            reason?: string;
            quote?: { shippingFeeUsd: number; discountUsd: number };
          };
        }
      ).data;
    };

    /**
     * 无券基线：券被拒时接口只回 `{ok:false, reason}`（不带 quote，这是对的），
     * 所以「这一单到底收不收运费」要从服务层读，否则无从判断该拒绝还是该放行。
     */
    const baselineShipping = async (quantity: number) => {
      const q = await quoteOrderAmounts({
        items: [{ productId, quantity }],
        shippingMethod: "standard",
        couponCode: null,
        userId,
      });
      return q.shippingFeeUsd;
    };

    // 运费与免邮门槛从 DB 读，不写死业务参数
    if (shippingFee <= 0) {
      // standard 本就零运费 → 免邮券永远无实际优惠
      const r = await applyWithCoupon(1);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("NOT_APPLICABLE");
      return;
    }

    if (freeOver > 0 && productPrice < freeOver) {
      // ① 未达免邮门槛：运费照收 → 券可用，且减免额恰好等于运费
      expect(await baselineShipping(1)).toBeCloseTo(shippingFee, 2);
      const charged = await applyWithCoupon(1);
      expect(charged.ok).toBe(true);
      expect(charged.quote!.shippingFeeUsd).toBeCloseTo(shippingFee, 2);
      expect(charged.quote!.discountUsd).toBeCloseTo(shippingFee, 2);

      // ② 越过免邮门槛：运费已为 0 → 券无实际优惠，必须明确拒绝
      const enoughQty = Math.ceil(freeOver / productPrice);
      expect(await baselineShipping(enoughQty)).toBe(0);
      const free = await applyWithCoupon(enoughQty);
      expect(free.ok).toBe(false);
      expect(free.reason).toBe("NOT_APPLICABLE");
      return;
    }

    // 单件价已越过免邮门槛（或本就不设门槛）→ 运费恒为 0
    expect(await baselineShipping(1)).toBe(0);
    const always = await applyWithCoupon(1);
    expect(always.ok).toBe(false);
    expect(always.reason).toBe("NOT_APPLICABLE");
  });
});

describe("折扣码 · 下单核销", () => {
  it("下单时核销：订单折扣 / usedCount / 核销记录 三者一致，且金额恒等式成立", async () => {
    const code = `${CODE_PREFIX}ORDER`;
    const coupon = await makeCoupon({ code, type: "PERCENTAGE", value: 10 });

    const { POST } = await import("@/app/api/orders/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: {
        items: [{ productId, quantity: 2 }],
        addressId,
        shippingMethod: "standard",
        couponCode: code,
      },
    });
    expect(res.status).toBe(200);
    const created = (await getData(res)) as {
      order: {
        orderNumber: string;
        id: string;
        subtotal: number;
        shippingFee: number;
        tax: number;
        discount: number;
        total: number;
        couponCode: string | null;
      };
    };

    const o = created.order;
    expect(o.couponCode).toBe(code);
    expect(o.discount).toBeGreaterThan(0);
    // 金额恒等式：total = subtotal + shippingFee + tax − discount
    expect(Number((o.subtotal + o.shippingFee + o.tax - o.discount).toFixed(2))).toBeCloseTo(
      o.total,
      2,
    );

    // 券已核销一次
    const afterCoupon = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(afterCoupon.usedCount).toBe(1);

    // 核销记录与订单绑定，且记的是登录用户
    const redemptions = await prisma.couponRedemption.findMany({ where: { couponId: coupon.id } });
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]!.orderId).toBe(o.id);
    expect(redemptions[0]!.userId).toBe(userId);
    expect(Number(redemptions[0]!.discountAmount)).toBeCloseTo(o.discount, 2);
  });

  it("CNY 核销金额按订单币种落库，历史误存 USD 的行也按 Order.discount 展示", async () => {
    const code = `${CODE_PREFIX}CNY`;
    const coupon = await makeCoupon({ code, type: "FIXED", value: 5 });

    const { POST } = await import("@/app/api/orders/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: { ...cookiesOf(jar), currency: "CNY" },
      body: {
        items: [{ productId, quantity: 1 }],
        addressId,
        shippingMethod: "standard",
        couponCode: code,
      },
    });
    expect(res.status).toBe(200);
    const created = (await getData(res)) as {
      order: { id: string; currency: string; discount: number; total: number };
    };
    expect(created.order.currency).toBe("CNY");
    expect(created.order.discount).toBeGreaterThan(0);

    const redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { couponId: coupon.id, orderId: created.order.id },
    });
    expect(Number(redemption.discountAmount)).toBeCloseTo(created.order.discount, 2);

    // 模拟旧版本历史行：字段里误存了 USD 数字。展示层必须以 Order.discount 为准。
    await prisma.couponRedemption.update({
      where: { id: redemption.id },
      data: { discountAmount: 5 },
    });
    const { listUserRedemptions } = await import("@/server/services/coupon.service");
    const listed = (await listUserRedemptions(userId)).find((row) => row.id === redemption.id);
    expect(listed?.currency).toBe("CNY");
    expect(listed?.discountAmount).toBeCloseTo(created.order.discount, 2);
  });

  it("超过每人限次被拒（PER_USER_LIMIT），且不会重复核销", async () => {
    const code = `${CODE_PREFIX}PERUSER`;
    const coupon = await makeCoupon({ code, type: "FIXED", value: 5, perUserLimit: 1 });

    const { POST } = await import("@/app/api/orders/route");
    const order = (extra: Record<string, unknown> = {}) =>
      callApi(POST, {
        method: "POST",
        cookies: cookiesOf(jar),
        body: {
          items: [{ productId, quantity: 1 }],
          addressId,
          shippingMethod: "standard",
          couponCode: code,
          ...extra,
        },
      });

    const first = await order();
    expect(first.status).toBe(200);

    const second = await order();
    expect(second.status).toBe(400);
    const err = (await second.json()) as { error: { code: string } };
    expect(err.error.code).toBe("BAD_REQUEST");

    // 只核销了一次
    const afterCoupon = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(afterCoupon.usedCount).toBe(1);
  });

  it("总量用尽的券被拒（USAGE_LIMIT）", async () => {
    const code = `${CODE_PREFIX}EXHAUSTED`;
    const coupon = await makeCoupon({
      code,
      type: "FIXED",
      value: 5,
      usageLimit: 1,
      perUserLimit: 0,
    });
    await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: 1 } });

    const { POST } = await import("@/app/api/coupons/apply/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: { code, items: [{ productId, quantity: 1 }] },
    });
    const body = (await res.json()) as { data: { ok: boolean; reason?: string } };
    expect(body.data.ok).toBe(false);
    expect(body.data.reason).toBe("USAGE_LIMIT");
  });

  it("不使用折扣码的订单不受影响（discount 为 0，couponCode 为 null）", async () => {
    const { POST } = await import("@/app/api/orders/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: { items: [{ productId, quantity: 1 }], addressId, shippingMethod: "standard" },
    });
    expect(res.status).toBe(200);
    const created = (await getData(res)) as {
      order: {
        discount: number;
        couponCode: string | null;
        subtotal: number;
        shippingFee: number;
        tax: number;
        total: number;
      };
    };
    expect(created.order.discount).toBe(0);
    expect(created.order.couponCode).toBeNull();
    expect(
      Number((created.order.subtotal + created.order.shippingFee + created.order.tax).toFixed(2)),
    ).toBeCloseTo(created.order.total, 2);
  });
});

describe("折扣码 · 取消订单回补", () => {
  it("取消订单后券被还回：usedCount 归零、核销记录删除、可再次使用", async () => {
    const code = `${CODE_PREFIX}RESTORE`;
    const coupon = await makeCoupon({ code, type: "FIXED", value: 5, perUserLimit: 1 });

    const { POST } = await import("@/app/api/orders/route");
    const created = (await getData(
      await callApi(POST, {
        method: "POST",
        cookies: cookiesOf(jar),
        body: {
          items: [{ productId, quantity: 1 }],
          addressId,
          shippingMethod: "standard",
          couponCode: code,
        },
      }),
    )) as { order: { orderNumber: string } };

    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);

    const { POST: cancelPost } = await import("@/app/api/orders/[orderNumber]/cancel/route");
    const cancel = await callApi(cancelPost, {
      method: "POST",
      cookies: cookiesOf(jar),
      params: { orderNumber: created.order.orderNumber },
    });
    expect(cancel.status).toBe(200);

    // 券被完整回补
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(0);
    expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(0);

    // 回补后能再次使用（否则用户的券就被白吃了）
    await resetLimits(userId);
    const reuse = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: {
        items: [{ productId, quantity: 1 }],
        addressId,
        shippingMethod: "standard",
        couponCode: code,
      },
    });
    expect(reuse.status).toBe(200);
  });
});

describe("游客结账", () => {
  it("未登录可下单：记 userId=null、留下 contactEmail，并下发免登录查单令牌", async () => {
    const { POST } = await import("@/app/api/orders/route");
    const res = await callApi(POST, {
      method: "POST",
      body: {
        items: [{ productId, quantity: 1 }],
        contactEmail: "Guest.Buyer@Example.COM",
        shippingAddress: GUEST_ADDRESS,
        shippingMethod: "standard",
      },
    });
    expect(res.status).toBe(200);
    const data = (await getData(res)) as {
      order: { orderNumber: string; id: string; userId: string | null };
      orderToken: string | null;
    };

    expect(data.order.userId).toBeNull();
    // 游客单必须给免登录查询凭据，否则用户付完钱查不到自己的订单
    expect(data.orderToken).toBeTruthy();

    const row = await prisma.order.findUniqueOrThrow({ where: { id: data.order.id } });
    expect(row.userId).toBeNull();
    // contactEmail 落库前做小写归一化（与券的 normalizeEmail 同一口径）——
    // 否则 "A@b.com" 与 "a@B.com" 会被当成两个人，游客可以绕过每人限次。
    expect(row.contactEmail).toBe("guest.buyer@example.com");
    expect(row.accessToken).toBe(data.orderToken);
  });

  it("游客单缺少联系邮箱被拒（邮箱是订单邮件与限次券的唯一凭据）", async () => {
    const { POST } = await import("@/app/api/orders/route");
    const res = await callApi(POST, {
      method: "POST",
      body: {
        items: [{ productId, quantity: 1 }],
        shippingAddress: GUEST_ADDRESS,
        shippingMethod: "standard",
      },
    });
    expect(res.status).toBe(400);
  });

  it("游客单缺少收货地址被拒", async () => {
    const { POST } = await import("@/app/api/orders/route");
    const res = await callApi(POST, {
      method: "POST",
      body: {
        items: [{ productId, quantity: 1 }],
        contactEmail: "g@example.com",
        shippingMethod: "standard",
      },
    });
    expect(res.status).toBe(400);
  });

  it("游客用券：按邮箱计每人限次，且大小写不同的同一邮箱视为同一人", async () => {
    const code = `${CODE_PREFIX}GUEST`;
    const coupon = await makeCoupon({ code, type: "FIXED", value: 5, perUserLimit: 1 });

    const { POST } = await import("@/app/api/orders/route");
    const guestOrder = (email: string) =>
      callApi(POST, {
        method: "POST",
        body: {
          items: [{ productId, quantity: 1 }],
          contactEmail: email,
          shippingAddress: GUEST_ADDRESS,
          shippingMethod: "standard",
          couponCode: code,
        },
      });

    const first = await guestOrder("Roundtrip@Example.com");
    expect(first.status).toBe(200);

    // 核销记录挂的是归一化后的邮箱（小写），不是 userId
    const redemptions = await prisma.couponRedemption.findMany({ where: { couponId: coupon.id } });
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]!.userId).toBeNull();
    expect(redemptions[0]!.email).toBe("roundtrip@example.com");

    // 换个大小写再来一单 —— 必须被认出是同一人
    await resetLimits();
    const second = await guestOrder("ROUNDTRIP@example.COM");
    expect(second.status).toBe(400);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);
  });

  it("游客公开商品补全返回 isPresale，供游客购物车与结账共用可购谓词", async () => {
    const original = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const { GET } = await import("@/app/api/cart/preview/route");
    try {
      await prisma.product.update({ where: { id: productId }, data: { isPresale: true } });
      const res = await callApi(GET, {
        headers: { "x-test-url": `/api/cart/preview?ids=${productId}` },
      });
      expect(res.status).toBe(200);
      const data = (await getData(res)) as { products: { id: string; isPresale: boolean }[] };
      expect(data.products.find((product) => product.id === productId)?.isPresale).toBe(true);
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { isPresale: original.isPresale },
      });
    }
  });

  it("游客单不泄漏 accessToken 到订单列表序列化中", async () => {
    // 序列化层是安全边界：accessToken 一旦随列表流出，拿到列表的人就能查他人订单
    const { serializeOrder } = await import("@/server/serializers");
    const row = await prisma.order.findFirstOrThrow({ where: { accessToken: { not: null } } });
    const safe = serializeOrder(row) as Record<string, unknown>;
    expect("accessToken" in safe).toBe(false);
  });
});

describe("后台消息中心 RBAC", () => {
  it("SUPPORT 可读取自己的消息，CUSTOMER 仍被拒绝", async () => {
    const { GET } = await import("@/app/api/admin/notifications/route");
    const supportJar = (await login("support@example.com", "Support@123456")).jar;

    const support = await callApi(GET, { cookies: cookiesOf(supportJar) });
    expect(support.status).toBe(200);

    const customer = await callApi(GET, { cookies: cookiesOf(jar) });
    expect(customer.status).toBe(403);
  });
});
