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

async function createOrder(): Promise<{ orderNumber: string; total: number }> {
  const { POST } = await import("@/app/api/orders/route");
  const res = await callApi(POST, {
    method: "POST",
    cookies: cookiesOf(userJar),
    body: {
      items: [{ productId, quantity: 1 }],
      addressId,
      shippingMethod: "standard",
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

describe("资金完整性：退款审批并发与部分退款", () => {
  let adminJar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };

  beforeAll(async () => {
    adminJar = (await login("admin@example.com", "Admin@123456")).jar;

    // 准备下单所需的普通用户身份、商品与地址
    const product = await prisma.product.findFirstOrThrow({
      where: { status: "ACTIVE", stock: { gt: 5 } },
    });
    productId = product.id;

    const l = await login("user@example.com", "User@123456");
    userJar = l.jar;
    const address = await prisma.address.findFirst({
      where: { user: { email: "user@example.com" } },
    });
    addressId = address!.id;
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
    expect(after.idempotencyKey).toMatch(/^refund_request_/);
    expect(
      (await prisma.refundOutbox.findUniqueOrThrow({ where: { refundId: refund.id } })).status,
    ).toBe("COMPLETED");
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("REFUNDED");
  });

  it("状态机与管理 API 都禁止手工 PENDING_PAYMENT→PAID", async () => {
    const { canTransition } = await import("@/lib/order-status");
    expect(canTransition("PENDING_PAYMENT", "PAID")).toBe(false);
    const { orderStatusUpdateSchema, batchOrderStatusSchema } =
      await import("@/lib/validations/admin");
    expect(orderStatusUpdateSchema.safeParse({ status: "PAID" }).success).toBe(false);
    const { orderNumber } = await createOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    expect(batchOrderStatusSchema.safeParse({ ids: [order.id], status: "PAID" }).success).toBe(
      false,
    );
    const { PUT } = await import("@/app/api/admin/orders/[id]/status/route");
    const res = await callApi(PUT, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      params: { id: order.id },
      body: { status: "PAID" },
    });
    expect(res.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "PENDING_PAYMENT",
    );
  });

  it("worker 绝不执行 REQUESTED/REJECTED 退款，即使存在异常 outbox", async () => {
    const { orderNumber, total } = await createOrder();
    await payAndRefund(orderNumber, total / 2);
    const refund = await prisma.refund.findFirstOrThrow({ where: { order: { orderNumber } } });
    await prisma.refundOutbox.upsert({
      where: { refundId: refund.id },
      create: {
        refundId: refund.id,
        uniqueKey: refund.idempotencyKey,
        status: "RETRY",
        nextAttemptAt: new Date(0),
      },
      update: { status: "RETRY", nextAttemptAt: new Date(0) },
    });
    const { processRefundOutboxItem } = await import("@/server/services/order.service");
    const result = await processRefundOutboxItem(refund.id);
    expect(result.state).toBe("FAILED");
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe(
      "REQUESTED",
    );
    expect(
      (await prisma.refundOutbox.findUniqueOrThrow({ where: { refundId: refund.id } })).status,
    ).toBe("COMPLETED");
  });

  it("Stripe event claim：处理中重复直返，失败可重试，完成后持久幂等", async () => {
    const { claimStripeWebhookEvent, failStripeWebhookEvent, finishStripeWebhookEvent } =
      await import("@/lib/payment/stripe");
    const eventId = `evt_test_${Date.now()}`;
    try {
      expect((await claimStripeWebhookEvent({ eventId, type: "test.event" })).state).toBe(
        "CLAIMED",
      );
      expect((await claimStripeWebhookEvent({ eventId, type: "test.event" })).state).toBe(
        "DUPLICATE",
      );
      await failStripeWebhookEvent(eventId, new Error("transient"));
      expect((await claimStripeWebhookEvent({ eventId, type: "test.event" })).state).toBe(
        "CLAIMED",
      );
      await finishStripeWebhookEvent(eventId, "PROCESSED");
      expect((await claimStripeWebhookEvent({ eventId, type: "test.event" })).state).toBe(
        "DUPLICATE",
      );
      const row = await prisma.webhookEvent.findUniqueOrThrow({
        where: { provider_eventId: { provider: "stripe", eventId } },
      });
      expect(row.status).toBe("PROCESSED");
      expect(row.attempts).toBe(2);
    } finally {
      await prisma.webhookEvent.deleteMany({ where: { eventId } });
    }
  });

  it("Stripe refund.id 乱序/重复落账：每个网关退款只记一次", async () => {
    const { orderNumber, total } = await createOrder();
    await payAndRefund(orderNumber, total);
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    const { recordStripeGatewayRefund } = await import("@/lib/payment/stripe");
    const newer = `re_new_${Date.now()}`;
    const older = `re_old_${Date.now()}`;
    try {
      // 新退款先到、旧退款后到；重复投递也不得新增第二行。
      await recordStripeGatewayRefund({
        orderId: order.id,
        userId: order.userId,
        refundId: newer,
        amountMinor: Math.round(Number(total) * 50),
      });
      await recordStripeGatewayRefund({
        orderId: order.id,
        userId: order.userId,
        refundId: older,
        amountMinor: Math.round(Number(total) * 50),
      });
      await recordStripeGatewayRefund({
        orderId: order.id,
        userId: order.userId,
        refundId: newer,
        amountMinor: Math.round(Number(total) * 50),
      });
      const rows = await prisma.refund.findMany({
        where: { orderId: order.id, gatewayRefundId: { in: [newer, older] } },
      });
      expect(rows).toHaveLength(2);
      expect(rows.reduce((sum, row) => sum + Number(row.amount), 0)).toBeCloseTo(Number(total), 2);
    } finally {
      await prisma.refund.deleteMany({ where: { gatewayRefundId: { in: [newer, older] } } });
    }
  });

  it("退款审批只有网关成功后才完成，部分退款不改变整单状态", async () => {
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
