/**
 * 集成测试说明：
 * - 需要 PostgreSQL（.env.test 中 DATABASE_URL 指向的库）与种子数据
 * - global-setup 会自动执行 prisma db push + db seed
 * - 未配置数据库时本文件测试将失败（单元测试不受影响）
 */
import { describe, expect, it, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";

describe("数据库连通性", () => {
  beforeAll(async () => {
    // 确认数据库可用；不可用时给出明确提示
    try {
      await prisma.$connect();
    } catch {
      throw new Error(
        "无法连接测试数据库。请先启动 PostgreSQL 并在 .env.test 配置 DATABASE_URL，或跳过集成测试（npm run test:unit）",
      );
    }
  });

  it("种子数据已写入", async () => {
    const [users, products, categories] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.category.count(),
    ]);
    expect(users).toBeGreaterThanOrEqual(3);
    expect(products).toBeGreaterThanOrEqual(20);
    // 官方镜像目录为 2 个分类（X Collection / SpaceXAI Collection）
    expect(categories).toBeGreaterThanOrEqual(2);
  });

  it("种子账号存在且角色正确", async () => {
    const admin = await prisma.user.findUnique({ where: { email: "admin@example.com" } });
    const user = await prisma.user.findUnique({ where: { email: "user@example.com" } });
    expect(admin?.role).toBe("ADMIN");
    expect(user?.role).toBe("CUSTOMER");
  });

  it("订单/购物车表可用", async () => {
    await expect(prisma.order.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(prisma.cartItem.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
