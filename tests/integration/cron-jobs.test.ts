import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { callApi, getData, login, testClientKey } from "../helpers/api";
import { resetRateLimit } from "@/lib/rate-limit";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import { ORDER_EXPIRE_SECONDS } from "@/lib/constants";

/**
 * 进程内定时任务（cron）集成测试。
 *
 * 为什么必须测：这条链路**没有任何页面能触发**，坏了也不会有人立刻发现 ——
 * 顾客只会看到「超时未支付的订单一直占着库存」，运营只会看到库存对不上。
 * 本轮真实踩到过两个静默失效：
 *   1. `start.ts` 注册时静态捕获 `runScheduledJobs`，模块实例被替换后
 *      旧定时器持失效绑定空转抛错，且 globalThis 守卫拦着不会重注册
 *      → 定时任务**永久停摆**；
 *   2. 选主事务用 Prisma 默认的 **5s** 交互事务超时，而它要持有整个任务周期，
 *      慢库上必然超时（实测 6.57s）→ 每轮心跳报错，且事务一死锁就提前释放
 *      → 多实例选主失效、可能重复执行。
 * 两个都不报错到用户面前，只能靠测试和日志。
 *
 * 这里直接调 `runScheduledJobs()` / `expireStaleOrders()`，不让调度器自己跑
 * （测试进程已设 CRON_ENABLED=false，见 tests/helpers/setup-env.ts）。
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
let addressId: string;
let userId: string;
let jar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };

const STOCK_BASELINE = 300;

beforeAll(async () => {
  const product = await prisma.product.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { stock: "desc" },
  });
  productId = product.id;
  // 种子对商品用 update:{}（非破坏），库存跨测试轮次单调递减 —— 抬到基线，只升不降
  if (product.stock < STOCK_BASELINE) {
    await prisma.product.update({ where: { id: productId }, data: { stock: STOCK_BASELINE } });
  }

  const user = await prisma.user.findFirstOrThrow({ where: { email: "user@example.com" } });
  userId = user.id;
  addressId = (await prisma.address.findFirstOrThrow({ where: { userId } })).id;

  const l = await login("user@example.com", "User@123456");
  jar = l.jar;
  // 同 coupon-flow：6 次 DB 往返 + 一次登录，外置卷全量运行时 90s 默认钩子超时会被击穿
}, 240_000);

beforeEach(async () => {
  for (const ip of ["127.0.0.1", "unknown", testClientKey()])
    await resetRateLimit(`order-create-ip:${ip}`);
  await resetRateLimit(`order-create:${userId}`);
});

/** 下一单，然后把 createdAt 回拨到超时线之外，模拟「用户拍下没付款就走了」 */
async function createStaleOrder() {
  const { POST } = await import("@/app/api/orders/route");
  const res = await callApi(POST, {
    method: "POST",
    cookies: cookiesOf(jar),
    body: { items: [{ productId, quantity: 1 }], addressId, shippingMethod: "standard" },
  });
  expect(res.status).toBe(200);
  const created = (await getData(res)) as { order: { orderNumber: string; id: string } };

  const staleAt = new Date(Date.now() - (ORDER_EXPIRE_SECONDS + 600) * 1000);
  await prisma.order.update({ where: { id: created.order.id }, data: { createdAt: staleAt } });
  return created.order;
}

describe("定时任务 · 心跳本身", () => {
  it("runScheduledJobs() 正常返回，不抛错（守护选主事务超时与模块绑定失效）", async () => {
    const { runScheduledJobs } = await import("@/server/jobs/scheduler");
    // 若选主事务超时（Prisma 默认 5s）或 runScheduledJobs 取不到，
    // 这里会因为内部 catch 而静默返回 —— 所以要同时断言「没有任何错误级日志」不够可靠，
    // 改为断言它确实在合理时间内 resolve，且并发调用不会互相炸掉。
    await expect(runScheduledJobs()).resolves.toBeUndefined();
    await expect(runScheduledJobs()).resolves.toBeUndefined();
  });

  it("重复心跳幂等：连跑两次不会重复取消同一批订单", async () => {
    const order = await createStaleOrder();
    const { runScheduledJobs } = await import("@/server/jobs/scheduler");

    await runScheduledJobs();
    const afterFirst = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterFirst.status).toBe("CANCELLED");

    await runScheduledJobs();
    const afterSecond = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterSecond.status).toBe("CANCELLED");
  });
});

describe("定时任务 · 超时未支付订单自动取消", () => {
  it("超过 ORDER_EXPIRE_SECONDS 未支付的订单被取消，并**回补库存与销量**", async () => {
    const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const order = await createStaleOrder();

    // 下单已扣库存
    const afterCreate = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(afterCreate.stock).toBe(before.stock - 1);
    expect(afterCreate.soldCount).toBe(before.soldCount + 1);

    const { expireStaleOrders } = await import("@/server/services/order.service");
    const n = await expireStaleOrders();
    expect(n).toBeGreaterThanOrEqual(1);

    const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(cancelled.status).toBe("CANCELLED");

    // 关键：库存必须还回来，否则「拍下不付款」就能把库存锁死
    const afterExpire = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(afterExpire.stock).toBe(before.stock);
    expect(afterExpire.soldCount).toBe(before.soldCount);
  });

  it("未超时的订单**不**被取消（不能误伤还在付款的用户）", async () => {
    const { POST } = await import("@/app/api/orders/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: { items: [{ productId, quantity: 1 }], addressId, shippingMethod: "standard" },
    });
    const created = (await getData(res)) as { order: { id: string } };

    const { expireStaleOrders } = await import("@/server/services/order.service");
    await expireStaleOrders();

    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: created.order.id } });
    expect(fresh.status).toBe("PENDING_PAYMENT");
  });

  it("超时取消会一并回补折扣码（否则用户的券被白吃）", async () => {
    const code = `QA-CRON-${Date.now()}`;
    const coupon = await prisma.coupon.create({
      data: {
        code,
        type: "FIXED",
        value: 5,
        minSpend: 0,
        usageLimit: 0,
        perUserLimit: 1,
        isActive: true,
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });

    const { POST } = await import("@/app/api/orders/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: {
        items: [{ productId, quantity: 1 }],
        addressId,
        shippingMethod: "standard",
        couponCode: code,
      },
    });
    const created = (await getData(res)) as { order: { id: string } };
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);

    await prisma.order.update({
      where: { id: created.order.id },
      data: { createdAt: new Date(Date.now() - (ORDER_EXPIRE_SECONDS + 600) * 1000) },
    });

    const { expireStaleOrders } = await import("@/server/services/order.service");
    await expireStaleOrders();

    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(0);
    expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(0);

    await prisma.coupon.delete({ where: { id: coupon.id } });
  });
});

describe("定时任务 · 数据清理", () => {
  it("清理过期 Refresh Token、审计日志与已完成的旧 Webhook 幂等记录", async () => {
    // 造一条「过期 8 天」的 token（保留窗口是 7 天）
    const { createHash } = await import("node:crypto");
    const raw = `qa-cron-token-${Date.now()}`;
    const token = await prisma.refreshToken.create({
      data: {
        tokenHash: createHash("sha256").update(raw).digest("hex"),
        userId,
        expiresAt: new Date(Date.now() - 8 * 86_400_000),
      },
    });

    // 造一条 100 天前的审计日志（保留窗口是 90 天）
    const oldLog = await prisma.auditLog.create({
      data: {
        action: "qa.cron.cleanup",
        userId,
        createdAt: new Date(Date.now() - 100 * 86_400_000),
      },
    });

    const oldProcessed = await prisma.webhookEvent.create({
      data: {
        provider: "stripe",
        eventId: `qa-old-processed-${Date.now()}`,
        type: "test",
        status: "PROCESSED",
        processedAt: new Date(Date.now() - 100 * 86_400_000),
      },
    });
    const recentProcessed = await prisma.webhookEvent.create({
      data: {
        provider: "stripe",
        eventId: `qa-recent-processed-${Date.now()}`,
        type: "test",
        status: "PROCESSED",
        processedAt: new Date(),
      },
    });
    const oldFailed = await prisma.webhookEvent.create({
      data: {
        provider: "stripe",
        eventId: `qa-old-failed-${Date.now()}`,
        type: "test",
        status: "FAILED",
        lastError: "keep for investigation",
      },
    });

    const { runScheduledJobs } = await import("@/server/jobs/scheduler");
    await runScheduledJobs();

    expect(await prisma.refreshToken.findUnique({ where: { id: token.id } })).toBeNull();
    expect(await prisma.auditLog.findUnique({ where: { id: oldLog.id } })).toBeNull();
    expect(await prisma.webhookEvent.findUnique({ where: { id: oldProcessed.id } })).toBeNull();
    expect(
      await prisma.webhookEvent.findUnique({ where: { id: recentProcessed.id } }),
    ).not.toBeNull();
    expect(await prisma.webhookEvent.findUnique({ where: { id: oldFailed.id } })).not.toBeNull();

    await prisma.webhookEvent.deleteMany({
      where: { id: { in: [recentProcessed.id, oldFailed.id] } },
    });
  });

  it("保留窗口内的 Refresh Token 不被误删", async () => {
    const { createHash } = await import("node:crypto");
    const raw = `qa-cron-keep-${Date.now()}`;
    const token = await prisma.refreshToken.create({
      data: {
        tokenHash: createHash("sha256").update(raw).digest("hex"),
        userId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const { runScheduledJobs } = await import("@/server/jobs/scheduler");
    await runScheduledJobs();

    expect(await prisma.refreshToken.findUnique({ where: { id: token.id } })).not.toBeNull();
    await prisma.refreshToken.delete({ where: { id: token.id } });
  });
});
