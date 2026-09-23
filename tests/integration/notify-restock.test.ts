import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mail", () => ({ sendMail: sendMailMock }));

import { prisma } from "@/lib/prisma";
import { notifyRestock } from "@/server/services/notify-me.service";

/**
 * 到货通知：补货自动邮件链路（商业功能回归）。
 *
 * 大爷点名确认的商业场景：顾客登记「到货通知」后，商家补货应当**自动**
 * 发出带商品卡的提醒邮件（广而告之）。
 *
 * 链路：后台改库存（PUT /stock）→ notifyRestock(productId) → 变体级匹配
 * → 逐条发信 → 登记置为 notified（防重）。
 * 本文件锁定三个不变量：售罄不发、补货必发、重复触发不重发。
 */

const SUITE = `restock-${Date.now()}`;

describe("到货通知：补货自动触发", () => {
  let categoryId = "";
  let productId = "";
  const email = `${SUITE}@test.local`;

  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { name: `补货测试分类${SUITE}`, slug: `${SUITE}-cat` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: "补货通知测试商品",
        slug: `${SUITE}-slug`,
        sku: `${SUITE}-sku`,
        description: "到货通知链路测试",
        price: 99,
        stock: 0, // 初始售罄
        status: "ACTIVE",
        categoryId: category.id,
        images: [],
      },
    });
    productId = product.id;
    await prisma.notifyMe.create({
      data: { email, productId, status: "draft", lang: "zh" },
    });
  });

  beforeEach(() => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ delivered: true, channel: "smtp" });
  });

  afterAll(async () => {
    await prisma.notifyMe.deleteMany({ where: { email: { startsWith: SUITE } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: SUITE } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: SUITE } } });
  });

  it("售罄不发、补货自动发、重复触发不重发", async () => {
    // 1. 仍售罄：谁都不通知
    expect(await notifyRestock(productId)).toBe(0);

    // 2. 补货 0 → 5：自动发出 1 封
    await prisma.product.update({ where: { id: productId }, data: { stock: 5 } });
    expect(await notifyRestock(productId)).toBe(1);

    // 3. 防重：再次触发同一商品不再发（否则每次改价/改文案都会轰炸顾客）
    expect(await notifyRestock(productId)).toBe(0);

    const sub = await prisma.notifyMe.findFirstOrThrow({ where: { email } });
    expect(sub.status).toBe("notified");
    expect(sub.notifiedAt).not.toBeNull();
  });

  it("console 未投递或发送异常时保持 draft，后续触发可成功重试", async () => {
    const consoleEmail = `${SUITE}-console@test.local`;
    const errorEmail = `${SUITE}-error@test.local`;
    await prisma.notifyMe.createMany({
      data: [
        { email: consoleEmail, productId, status: "draft" },
        { email: errorEmail, productId, status: "draft" },
      ],
    });

    sendMailMock
      .mockResolvedValueOnce({ delivered: false, channel: "console" })
      .mockRejectedValueOnce(new Error("smtp unavailable"));

    expect(await notifyRestock(productId)).toBe(0);
    const failed = await prisma.notifyMe.findMany({
      where: { email: { in: [consoleEmail, errorEmail] } },
      orderBy: { email: "asc" },
    });
    expect(failed).toHaveLength(2);
    expect(failed.every((row) => row.status === "draft" && row.notifiedAt === null)).toBe(true);

    // beforeEach 的成功结果代表真实通道恢复；两条都应只重试一次并转为 notified。
    expect(await notifyRestock(productId)).toBe(2);
    const retried = await prisma.notifyMe.findMany({
      where: { email: { in: [consoleEmail, errorEmail] } },
    });
    expect(retried.every((row) => row.status === "notified" && row.notifiedAt !== null)).toBe(true);
  });

  it("游标分批处理超过 200 条订阅，不把首批之外永久留在 draft", async () => {
    const bulk = Array.from({ length: 201 }, (_, i) => ({
      email: `${SUITE}-bulk-${i}@test.local`,
      productId,
      status: "draft",
    }));
    await prisma.notifyMe.createMany({ data: bulk });

    expect(await notifyRestock(productId)).toBe(201);
    expect(
      await prisma.notifyMe.count({
        where: { productId, email: { contains: `${SUITE}-bulk-` }, status: "notified" },
      }),
    ).toBe(201);
  });

  it("下架商品即使有库存也不通知", async () => {
    const p2 = await prisma.product.create({
      data: {
        name: "下架补货测试商品",
        slug: `${SUITE}-off`,
        sku: `${SUITE}-off-sku`,
        description: "下架状态不通知",
        price: 50,
        stock: 3,
        status: "DRAFT",
        categoryId,
        images: [],
      },
    });
    const email2 = `${SUITE}-off@test.local`;
    await prisma.notifyMe.create({ data: { email: email2, productId: p2.id, status: "draft" } });

    expect(await notifyRestock(p2.id)).toBe(0);
    const sub2 = await prisma.notifyMe.findFirstOrThrow({ where: { email: email2 } });
    expect(sub2.status).toBe("draft"); // 仍在等待

    await prisma.notifyMe.deleteMany({ where: { email: email2 } });
    await prisma.product.delete({ where: { id: p2.id } });
  });
});
