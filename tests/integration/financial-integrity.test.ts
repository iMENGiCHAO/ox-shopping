import { describe, expect, it, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { callApi, getData, login } from "../helpers/api";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import bcrypt from "bcryptjs";

/**
 * 资金完整性回归测试：
 * 1. 限量优惠券：下单占用 → 取消释放 → 可再次使用；超限下单被拒
 * 2. 退款审批并发：同一退款单只成功一次；部分退款不改变整单状态
 */

function cookiesOf(jar: { get: (n: string) => string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const v = jar.get(n);
    if (v) out[n] = v;
  }
  return out;
}

let productId: string;
let userId: string;
let addressId: string;
let userJar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };

async function createOrder(couponCode?: string): Promise<{ orderNumber: string; total: number }> {
  const { POST } = await import("@/app/api/orders/route");
  const res = await callApi(POST, {
    method: "POST",
    cookies: cookiesOf(userJar),
    body: {
      items: [{ productId, quantity: 1 }],
      addressId,
      shippingMethod: "standard",
      couponCode: couponCode ?? "",
    },
  });
  expect(res.status).toBe(200);
  const data = (await getData(res)) as {
    order: { orderNumber: string; total: number; status: string };
  };
  expect(data.order.status).toBe("PENDING_PAYMENT");
  return { orderNumber: data.order.orderNumber, total: data.order.total };
}

async function cancelOrder(orderNumber: string): Promise<number> {
  const { POST } = await import("@/app/api/orders/[orderNumber]/cancel/route");
  const res = await callApi(POST, {
    method: "POST",
    cookies: cookiesOf(userJar),
    params: { orderNumber },
  });
  return res.status;
}

describe("资金完整性：优惠券限额与取消释放", () => {
  beforeAll(async () => {
    const product = await prisma.product.findFirstOrThrow({
      where: { status: "ACTIVE", stock: { gt: 5 } },
    });
    productId = product.id;

    // 独立测试用户，避免与其它用例共享下单限流
    const email = `integrity-${Date.now()}@test.local`;
    const passwordHash = await bcrypt.hash("Integrity@123456", 12);
    const user = await prisma.user.create({
      data: { email, name: "资金完整性测试", passwordHash, emailVerified: true },
    });
    userId = user.id;
    const address = await prisma.address.create({
      data: {
        userId,
        recipientName: "测试",
        phone: "13800138000",
        province: "广东省",
        city: "深圳市",
        district: "南山区",
        detail: "测试路 1 号",
        isDefault: true,
      },
    });
    addressId = address.id;
    userJar = (await login(email, "Integrity@123456")).jar;
  });

  it("限量券：下单占用 → 超限被拒 → 取消释放后可再用", async () => {
    const code = `LIMIT${Date.now()}`.slice(-16).toUpperCase();
    const coupon = await prisma.coupon.create({
      data: {
        code,
        type: "PERCENTAGE",
        value: 10,
        minSpend: 0,
        startsAt: new Date(Date.now() - 3600_000),
        endsAt: new Date(Date.now() + 3600_000),
        usageLimit: 1,
        isActive: true,
      },
    });

    // 第一单占用额度
    const first = await createOrder(code);

    // 第二单超限 → 400
    const { POST } = await import("@/app/api/orders/route");
    const over = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: {
        items: [{ productId, quantity: 1 }],
        addressId,
        shippingMethod: "standard",
        couponCode: code,
      },
    });
    expect(over.status).toBe(400);

    // 取消第一单 → 释放额度
    expect(await cancelOrder(first.orderNumber)).toBe(200);
    const released = await prisma.couponRedemption.findFirst({
      where: { order: { orderNumber: first.orderNumber } },
    });
    expect(released).toBeNull();

    // 再次下单同一券 → 成功
    const second = await createOrder(code);
    expect(second.orderNumber).not.toBe(first.orderNumber);

    // 清理
    await cancelOrder(second.orderNumber).catch(() => undefined);
    await prisma.coupon.delete({ where: { id: coupon.id } }).catch(() => undefined);
  });
});

describe("资金完整性：退款审批并发与部分退款", () => {
  let adminJar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };

  beforeAll(async () => {
    adminJar = (await login("admin@example.com", "Admin@123456")).jar;
  });

  async function payAndRefund(orderNumber: string, amount: number) {
    const { POST: mockPayPost } = await import("@/app/api/orders/[orderNumber]/mock-pay/route");
    const { POST: refundPost } = await import("@/app/api/orders/[orderNumber]/refund/route");
    const pay = await callApi(mockPayPost, {
      method: "POST",
      cookies: cookiesOf(userJar),
      params: { orderNumber },
    });
    expect(pay.status).toBe(200);
    const refund = await callApi(refundPost, {
      method: "POST",
      cookies: cookiesOf(userJar),
      params: { orderNumber },
      body: {
        reason: "集成测试退款：商品与描述不符，申请退款。",
        amount: Math.round(amount * 100) / 100,
      },
    });
    expect(refund.status).toBe(200);
    return prisma.refund.findFirstOrThrow({
      where: { order: { orderNumber } },
      orderBy: { createdAt: "desc" },
    });
  }

  it("并发审批同一退款单只有一次成功", async () => {
    const { orderNumber, total } = await createOrder();
    const refund = await payAndRefund(orderNumber, total);

    const { PUT } = await import("@/app/api/admin/refunds/[id]/route");
    const [a, b] = await Promise.all([
      callApi(PUT, {
        method: "PUT",
        cookies: cookiesOf(adminJar),
        params: { id: refund.id },
        body: { decision: "approve", adminNote: "同意" },
      }),
      callApi(PUT, {
        method: "PUT",
        cookies: cookiesOf(adminJar),
        params: { id: refund.id },
        body: { decision: "approve", adminNote: "同意" },
      }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 400]);

    const after = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(after.status).toBe("REFUNDED");
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("REFUNDED");
  });

  it("部分退款不改变整单状态", async () => {
    const { orderNumber, total } = await createOrder();
    const refund = await payAndRefund(orderNumber, total / 2);

    const { PUT } = await import("@/app/api/admin/refunds/[id]/route");
    const approve = await callApi(PUT, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      params: { id: refund.id },
      body: { decision: "approve", adminNote: "部分退款" },
    });
    expect(approve.status).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("PAID");
  });
});
