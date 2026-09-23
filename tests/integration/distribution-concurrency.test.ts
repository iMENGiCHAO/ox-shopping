import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { applyOrderReversal, settleOrder } from "@/server/services/distribution/commission.service";

/**
 * 分销资金并发回归（P0）。
 *
 * 背景：「确认收货 → 结算」（settleOrder）与「退款 → 冲正」
 * （applyOrderReversal / reverseCommissionManually）是**同一行佣金流水**的
 * 两条并发写入路径。修复前两者各自在事务外读快照，再按快照算钱并回写
 * `status` / `settledAt`：
 *   · 冲正先改 reversedCny、结算仍按旧净额入账 → 多给分销商钱；
 *   · 冲正用旧 `settledAt` 判定「未结算」→ 不扣余额，还把已结算流水回写成
 *     PENDING → 下一轮结算再次入账（双重入账）。
 *
 * 修复后两条路径都对流水行加 `FOR UPDATE` 行锁，并在**同一事务内**读库内
 * 当前值决策。本文件断言并发结果的不变量：净额正确、状态收敛、不重复入账。
 *
 * 这些不变量此前没有任何测试覆盖 —— 它是真金白银的错账防线。
 */

const SUITE = `dist-conc-${Date.now()}`;

async function makeUser(tag: string) {
  return prisma.user.create({
    data: {
      email: `${SUITE}-${tag}@test.local`,
      name: `并发测试${tag}`,
      passwordHash: "not-a-real-hash",
    },
  });
}

/** 造一笔 100.00 的 PENDING 佣金流水（含所属订单） */
async function makePendingCommission(userId: string, orderNo: string) {
  const order = await prisma.order.create({
    data: {
      orderNumber: orderNo,
      userId,
      status: "PAID",
      subtotal: 100,
      total: 100,
      currency: "CNY",
      addressSnapshot: {
        recipientName: "收件人",
        phone: "13800000000",
        province: "省",
        city: "市",
        district: "区",
        detail: "详细地址",
      },
    },
  });
  const log = await prisma.commissionLog.create({
    data: {
      orderId: order.id,
      toUserId: userId,
      level: 1,
      ratio: 10,
      amount: 100,
      amountCny: 100,
    },
  });
  return { order, log };
}

describe("分销：结算与冲正并发（P0 回归）", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    // 订单删除级联清理佣金流水（schema: Order.commissions onDelete Cascade）
    await prisma.order.deleteMany({ where: { orderNumber: { startsWith: SUITE } } });
    await prisma.distributorAccount.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: SUITE } } });
  });

  it("并发「结算 + 全额冲正」：余额归零且状态收敛为 REVERSED", async () => {
    const user = await makeUser("both");
    createdUserIds.push(user.id);
    const { order } = await makePendingCommission(user.id, `${SUITE}-both`);

    // 真实并发：结算与全额冲正同时发起
    await Promise.all([
      settleOrder(order.id),
      applyOrderReversal(order.id, 1, "并发回归：全额冲正"),
    ]);

    const log = await prisma.commissionLog.findFirstOrThrow({ where: { orderId: order.id } });
    const account = await prisma.distributorAccount.findUnique({ where: { userId: user.id } });

    // 两种合法交错都必须收敛到「余额 0」：
    //   · 结算先到 → 入账 100，冲正再全额扣回；
    //   · 冲正先到 → 流水直接 REVERSED，结算查不到 PENDING，不入账。
    // 修复前会出现 100（漏扣）或 200（双重入账）。
    expect(Number(account?.balance ?? 0)).toBe(0);
    // 状态不得停留在 PENDING（否则下一轮结算会再次入账）
    expect(log.status).toBe("REVERSED");
    expect(Number(log.reversedCny)).toBe(100);
  });

  it("并发「结算 + 部分冲正 40%」：余额收敛为净额 60", async () => {
    const user = await makeUser("partial");
    createdUserIds.push(user.id);
    const { order } = await makePendingCommission(user.id, `${SUITE}-partial`);

    await Promise.all([
      settleOrder(order.id),
      applyOrderReversal(order.id, 0.4, "并发回归：部分冲正 40%"),
    ]);

    const account = await prisma.distributorAccount.findUnique({ where: { userId: user.id } });
    // 净额 = 100 − 40 = 60，与交错顺序无关
    expect(Number(account?.balance ?? 0)).toBe(60);

    const log = await prisma.commissionLog.findFirstOrThrow({ where: { orderId: order.id } });
    expect(Number(log.reversedCny)).toBe(40);
    expect(log.status).toBe("SETTLED");
  });

  it("连续两次结算幂等：只入账一次", async () => {
    const user = await makeUser("idem");
    createdUserIds.push(user.id);
    const { order } = await makePendingCommission(user.id, `${SUITE}-idem`);

    await settleOrder(order.id);
    await settleOrder(order.id);

    const account = await prisma.distributorAccount.findUnique({ where: { userId: user.id } });
    expect(Number(account?.balance ?? 0)).toBe(100);
  });

  it("先冲正后结算：不入账、余额为 0（全额冲正场景）", async () => {
    const user = await makeUser("rev-first");
    createdUserIds.push(user.id);
    const { order } = await makePendingCommission(user.id, `${SUITE}-rev-first`);

    await applyOrderReversal(order.id, 1, "并发回归：先冲正");
    await settleOrder(order.id);

    const account = await prisma.distributorAccount.findUnique({ where: { userId: user.id } });
    expect(Number(account?.balance ?? 0)).toBe(0);
  });
});
