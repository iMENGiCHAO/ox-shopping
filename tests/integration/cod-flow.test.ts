import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { callApi, getData, login } from "../helpers/api";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import { resetRateLimit } from "@/lib/rate-limit";

/**
 * COD（货到付款）业务语义 + 多币种分账恒等式的集成回归。
 *
 * 覆盖的商业缺陷（docs/COMMERCIAL_DELIVERY_GAP_ANALYSIS.md）：
 * - A2 COD：下单必须**跳过支付环节**（直接 PROCESSING）、到付费落库（codFee）、
 *   paymentProvider=cod、无 paymentUrl、取消可回补库存、mock 支付对 COD 单无效
 * - A4 多币种：落库金额满足恒等式 total = subtotal + shipping + tax − discount，
 *   且 Σ 行小计 = subtotal（订单页明细求和必须等于小计行）
 */

const COD_CODE = "cod-integration-test";

function cookiesOf(jar: { get: (n: string) => string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const v = jar.get(n);
    if (v) out[n] = v;
  }
  return out;
}

describe("COD 货到付款语义 + 分账恒等式", () => {
  let productId: string;
  /** 选取商品 pin 前的原库存（<0 = 未 pin）——afterAll 恢复用 */
  let originalStock = -1;
  let userId: string;
  let addressId: string;
  let userJar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };
  let createdMethodId: string | null = null;
  const createdOrderNumbers: string[] = [];

  beforeAll(async () => {
    // COD 配送方式（fee=7.00 作为到付服务费）：测试库可能没有，临时建一个
    const existing = await prisma.shippingMethod.findUnique({ where: { code: COD_CODE } });
    if (existing) {
      createdMethodId = null;
    } else {
      const created = await prisma.shippingMethod.create({
        data: {
          code: COD_CODE,
          name: "货到付款（测试）",
          nameEn: "Cash on delivery (test)",
          fee: "7.00",
          isCashOnDelivery: true,
          isActive: true,
          sortOrder: 999,
        },
      });
      createdMethodId = created.id;
    }

    const product = await prisma.product.findFirstOrThrow({
      where: { status: "ACTIVE", stock: { gt: 5 } },
    });
    productId = product.id;

    // 库存自给自足（修复跨轮泄漏）：本文件连续下单累计消耗 ~9 件，而 afterAll
    // 的 deleteMany 只删订单**不会回补库存**——多轮运行曾把种子商品抽到
    // 「下单时只剩 2 件」，末尾 qty=3 的分账恒等式用例因此失败。
    // 选取后统一 pin 到充足值，跑完恢复原值：轮内绝对够用，跨轮零净消耗。
    originalStock = product.stock;
    await prisma.product.update({ where: { id: product.id }, data: { stock: 99 } });

    const l = await login("user@example.com", "User@123456");
    userJar = l.jar;
    // login() 只返回 { response, jar }，用户 id 从库里取
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: "user@example.com" } })).id;
    const address = await prisma.address.findFirstOrThrow({
      where: { user: { email: "user@example.com" } },
    });
    addressId = address.id;
  });

  afterAll(async () => {
    // 清理本次创建的订单（级联清理 items/attribution 等）
    if (createdOrderNumbers.length > 0) {
      await prisma.order.deleteMany({ where: { orderNumber: { in: createdOrderNumbers } } });
    }
    // 恢复 pin 前的原库存：deleteMany 不回补库存，必须显式恢复，
    // 否则每轮运行都从种子商品净抽 ~7 件（历史遗留已实际发生，见 beforeAll 注释）
    if (originalStock >= 0) {
      await prisma.product.update({ where: { id: productId }, data: { stock: originalStock } });
    }
    if (createdMethodId) {
      await prisma.shippingMethod.delete({ where: { id: createdMethodId } }).catch(() => null);
    }
  });

  async function placeOrder(shippingMethod: string, quantity = 1) {
    // 下单接口有「同用户 5 单/10 分钟」限流（本测试要连续下 6 单）：
    // 先复位该用户的下单桶 —— 这本身也顺带验证了限流键按 userId 生效
    await resetRateLimit(`order-create:${userId}`);
    const { POST } = await import("@/app/api/orders/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: {
        items: [{ productId, quantity }],
        addressId,
        shippingMethod,
        contactEmail: "user@example.com",
      },
    });
    const data = (await getData(res)) as {
      order: {
        orderNumber: string;
        status: string;
        total: number;
        subtotal: number;
        shippingFee: number;
        tax: number;
        discount: number;
        codFee: number | null;
        isCashOnDelivery: boolean;
        paymentProvider: string | null;
        paidAt: string | null;
        items: { subtotal: number; quantity: number }[];
      };
      paymentUrl: string | null;
    };
    if (data?.order?.orderNumber) createdOrderNumbers.push(data.order.orderNumber);
    return { res, data };
  }

  it("COD 下单：跳过支付环节（PROCESSING）、到付费落库、无支付地址", async () => {
    const { res, data } = await placeOrder(COD_CODE);
    expect(res.status).toBe(200);
    const o = data.order;

    // 关键语义：COD 不是「等支付」，直接进履约
    expect(o.status).toBe("PROCESSING");
    expect(o.isCashOnDelivery).toBe(true);
    expect(o.paymentProvider).toBe("cod");
    expect(o.paidAt).toBeNull();
    // 无线上支付入口
    expect(data.paymentUrl).toBeNull();
    // 到付参考金额：配送方式 fee（7 USD 基础价）按订单汇率快照换算成**订单币种**后落库
    // （币种口径回归：旧实现直接落 USD 原值，非 USD 订单的 total + codFee
    //  会把美元数当本币相加 —— 订单页/邮件/后台「送达应收现金」全部算错）
    expect(o.codFee).toBeGreaterThan(0);
    expect(o.shippingFee).toBe(0);
    // 送达时应收现金 = total + codFee（>total，两者同币种可直接相加）
    expect(o.total).toBeGreaterThan(0);

    // 落库值再确认一次（防止响应序列化与库不一致）。
    // 与订单自身汇率快照自洽 —— 任何测试币种（.env.test 换 CURRENCY）下都成立
    const db = await prisma.order.findUniqueOrThrow({ where: { orderNumber: o.orderNumber } });
    expect(db.status).toBe("PROCESSING");
    expect(db.isCashOnDelivery).toBe(true);
    const expectedCodFee = Math.round(7 * Number(db.exchangeRate) * 100) / 100;
    expect(Number(db.codFee)).toBe(expectedCodFee);
    // 响应与库一致
    expect(o.codFee).toBe(Number(db.codFee));
    expect(db.paidAt).toBeNull();
  });

  it("COD 未发货可取消且回补库存（现金交易无退款）", async () => {
    const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const qty = 2;
    const { data } = await placeOrder(COD_CODE, qty);
    const afterOrder = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(afterOrder.stock).toBe(before.stock - qty);

    const { POST: cancelPost } = await import("@/app/api/orders/[orderNumber]/cancel/route");
    const cancelRes = await callApi(cancelPost, {
      method: "POST",
      cookies: cookiesOf(userJar),
      params: { orderNumber: data.order.orderNumber },
    });
    expect(cancelRes.status).toBe(200);

    const afterCancel = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(afterCancel.stock).toBe(before.stock);

    const db = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: data.order.orderNumber },
    });
    expect(db.status).toBe("CANCELLED");
    expect(db.cancelledAt).not.toBeNull();
  });

  it("COD 单不可走 mock 支付（线上支付入口必须拒绝）", async () => {
    const { data } = await placeOrder(COD_CODE);
    const { POST: mockPayPost } = await import("@/app/api/orders/[orderNumber]/mock-pay/route");
    const res = await callApi(mockPayPost, {
      method: "POST",
      cookies: cookiesOf(userJar),
      params: { orderNumber: data.order.orderNumber },
    });
    // 单状态为 PROCESSING，mock-pay 只服务 PENDING_PAYMENT；任何非 2xx 都算正确拦截
    expect(res.status).toBeGreaterThanOrEqual(400);
    const db = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: data.order.orderNumber },
    });
    expect(db.paidAt).toBeNull();
  });

  it("在线单仍走支付环节（PENDING_PAYMENT + 有支付地址）——回归护栏", async () => {
    const { res, data } = await placeOrder("standard");
    expect(res.status).toBe(200);
    expect(data.order.status).toBe("PENDING_PAYMENT");
    expect(data.order.isCashOnDelivery).toBe(false);
    expect(data.paymentUrl).toBeTruthy();
  });

  it("落库金额满足恒等式：total = subtotal + shipping + tax − discount", async () => {
    const { data } = await placeOrder(COD_CODE);
    const o = data.order;
    const cents = (n: number) => Math.round(n * 100);
    expect(cents(o.total)).toBe(cents(o.subtotal + o.shippingFee + o.tax - o.discount));
  });

  it("Σ 行小计 == 订单小计（订单页明细求和必须等于 Subtotal 行）", async () => {
    const { data } = await placeOrder(COD_CODE, 3);
    const o = data.order;
    const cents = (n: number) => Math.round(n * 100);
    const linesSum = o.items.reduce((s, i) => s + cents(i.subtotal), 0);
    expect(linesSum).toBe(cents(o.subtotal));
  });
});
