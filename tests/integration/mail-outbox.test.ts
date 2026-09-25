import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  drainMailOutbox,
  processMailOutboxItem,
  queueMail,
} from "@/server/services/mail-outbox.service";

import type { MailData, MailTemplate } from "@/lib/mail";

/**
 * 事务邮件 outbox（mail_outbox 表）集成测试。
 *
 * 为什么必须测：这条队列是「订单确认/发货/退款邮件不丢」的唯一兜底 ——
 * 此前是 `void sendMail(...)` fire-and-forget，Resend/SMTP 抖动即永久丢信，
 * 顾客与运营都毫无感知（P1）。队列坏了不报错，等于悄悄退回裸奔。
 *
 * 网络侧用 vi.mock 控制 sendMail 的成败（成功 / 失败 / 重试到限三路），
 * outbox 状态机（认领原子性、指数退避、终态、租约与过期抢占）全部打真实
 * Postgres 验证 —— 这些不变量只有数据库能证实。
 */

const sendMailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mail")>();
  return { ...actual, sendMail: sendMailMock };
});

async function cleanOutbox() {
  await prisma.mailOutbox.deleteMany({});
}

beforeEach(async () => {
  sendMailMock.mockReset();
  await cleanOutbox();
});

afterEach(async () => {
  // 双清：保证串行执行时后续文件（如 cron-jobs）跑 runScheduledJobs 不扫到本文件残留
  await cleanOutbox();
});

const orderConfirmedPayload: {
  to: string;
  template: MailTemplate;
  data: MailData["order-confirmed"];
} = {
  to: "customer@example.com",
  template: "order-confirmed",
  data: {
    name: "张三",
    orderNumber: "R202609240001",
    total: "USD 25.00",
    items: [{ name: "T-Shirt", quantity: 1 }],
    orderUrl: "https://example.com/orders/R202609240001",
  },
};

describe("事务邮件 outbox · queueMail 落库与立即试发", () => {
  it("发送成功：落库 → 立即送达 → 置 SENT 并记录 sentAt", async () => {
    sendMailMock.mockResolvedValueOnce({ delivered: true, channel: "resend" });

    const result = await queueMail({ ...orderConfirmedPayload });

    expect(result.queued).toBe(true);
    expect(result.delivered).toBe(true);
    const row = await prisma.mailOutbox.findFirstOrThrow();
    expect(row.status).toBe("SENT");
    expect(row.sentAt).not.toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.to).toBe("customer@example.com");
    expect(row.template).toBe("order-confirmed");
    // 重放保真：调用方 payload 原样落库（lang/siteUrl 等由 sendMail 渲染时注入）
    expect(row.data).toMatchObject({ orderNumber: "R202609240001", name: "张三" });
  });

  it("发送失败：行回 PENDING 并按指数退避 + lastError 落库 —— 邮件不再静默丢失", async () => {
    sendMailMock.mockResolvedValueOnce({
      delivered: false,
      channel: "smtp",
      error: "ECONNREFUSED smtp.example.com:587",
    });

    const result = await queueMail({ ...orderConfirmedPayload });

    expect(result.queued).toBe(true);
    expect(result.delivered).toBe(false);
    const row = await prisma.mailOutbox.findFirstOrThrow();
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain("ECONNREFUSED");
    // 指数退避：attempts=1 → now+2min（不允许立即连发打爆网关）
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
  });

  it("落库失败退化直发：队列故障绝不反过来阻断下单/发货主流程", async () => {
    const createSpy = vi
      .spyOn(prisma.mailOutbox, "create")
      .mockRejectedValueOnce(new Error("db down"));
    sendMailMock.mockResolvedValueOnce({ delivered: true, channel: "resend" });

    const result = await queueMail({ ...orderConfirmedPayload });
    createSpy.mockRestore();

    expect(result.queued).toBe(false);
    expect(result.delivered).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});

describe("事务邮件 outbox · 重试状态机", () => {
  async function seedRow(overrides: Record<string, unknown> = {}) {
    return prisma.mailOutbox.create({
      data: {
        to: "retry@example.com",
        template: "order-shipped",
        data: {
          name: "李四",
          orderNumber: "R202609240002",
          trackingCompany: "UPS",
          trackingNumber: "1Z999",
          orderUrl: "https://example.com/orders/R202609240002",
        },
        status: "PENDING",
        nextAttemptAt: new Date(Date.now() - 1_000), // 已到期
        maxAttempts: 8,
        ...overrides,
      },
    });
  }

  it("退避到期后重试成功：PENDING → SENT", async () => {
    const row = await seedRow();
    sendMailMock
      .mockResolvedValueOnce({ delivered: false, channel: "smtp", error: "timeout" })
      .mockResolvedValueOnce({ delivered: true, channel: "smtp" });

    await processMailOutboxItem(row.id); // 第一次失败 → PENDING + 退避
    let fresh = await prisma.mailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(fresh.status).toBe("PENDING");
    expect(fresh.attempts).toBe(1);

    // 人为把退避拨到到期（模拟时间流逝），第二次成功
    await prisma.mailOutbox.update({ where: { id: row.id }, data: { nextAttemptAt: new Date() } });
    const r = await processMailOutboxItem(row.id);
    expect(r.state).toBe("SUCCEEDED");
    fresh = await prisma.mailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(fresh.status).toBe("SENT");
    expect(fresh.attempts).toBe(2);
  });

  it("重试到上限：置 FAILED 终态，attempts/maxAttempts 对齐，lastError 保留供排查", async () => {
    const row = await seedRow({ maxAttempts: 2, attempts: 1 }); // 还剩最后 1 次
    sendMailMock.mockResolvedValue({ delivered: false, channel: "smtp", error: "still down" });

    const r = await processMailOutboxItem(row.id);
    expect(r.state).toBe("FAILED");

    const fresh = await prisma.mailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(fresh.status).toBe("FAILED");
    expect(fresh.attempts).toBe(2);
    expect(fresh.lastError).toContain("still down");

    // FAILED 是终态：再调用不再认领、不再发送
    sendMailMock.mockClear();
    const again = await processMailOutboxItem(row.id);
    expect(again.state).toBe("FAILED");
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("租约保护：PROCESSING 期内不可被并发抢占；崩溃遗留的过期租约可被抢占重发", async () => {
    // ① 刚认领的活租约：另一个执行者必须空手而归，不重复发送
    const live = await seedRow({ status: "PROCESSING", claimedAt: new Date() });
    const r1 = await processMailOutboxItem(live.id);
    expect(r1.state).toBe("RETRY");
    expect(r1.delivered).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
    const untouched = await prisma.mailOutbox.findUniqueOrThrow({ where: { id: live.id } });
    expect(untouched.status).toBe("PROCESSING"); // 原租约未被覆盖

    // ② 6 分钟前的死租约（模拟认领后进程崩溃）：可被抢占并完成
    const stale = await seedRow({
      status: "PROCESSING",
      claimedAt: new Date(Date.now() - 6 * 60_000),
    });
    sendMailMock.mockResolvedValueOnce({ delivered: true, channel: "resend" });
    const r2 = await processMailOutboxItem(stale.id);
    expect(r2.state).toBe("SUCCEEDED");
    const fresh = await prisma.mailOutbox.findUniqueOrThrow({ where: { id: stale.id } });
    expect(fresh.status).toBe("SENT");
  });

  it("drain：批量接走所有到期任务，未到期的不动", async () => {
    await seedRow();
    await seedRow();
    const future = await seedRow({ nextAttemptAt: new Date(Date.now() + 60_000) });
    sendMailMock.mockResolvedValue({ delivered: true, channel: "resend" });

    const processed = await drainMailOutbox(10, 5_000);

    expect(processed).toBe(2);
    expect(await prisma.mailOutbox.findUniqueOrThrow({ where: { id: future.id } })).toMatchObject({
      status: "PENDING",
    });
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });
});
