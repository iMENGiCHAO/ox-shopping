import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { callApi, getData, login } from "../helpers/api";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";

/** 管理端 API 集成测试（RBAC + 商品/分类/统计/审计） */

function cookiesOf(jar: { get: (n: string) => string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const v = jar.get(n);
    if (v) out[n] = v;
  }
  return out;
}

let adminJar: { get: (n: string) => string | undefined };
let userJar: { get: (n: string) => string | undefined };
const createdProductId: string[] = [];

beforeAll(async () => {
  adminJar = (await login("admin@example.com", "Admin@123456")).jar;
  userJar = (await login("user@example.com", "User@123456")).jar;
});

afterAll(async () => {
  const ids = createdProductId.filter((id): id is string => typeof id === "string");
  if (ids.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }
});

describe("RBAC 权限", () => {
  it("CUSTOMER 访问管理接口 → 403", async () => {
    const { GET } = await import("@/app/api/admin/stats/route");
    const res = await callApi(GET, { cookies: cookiesOf(userJar) });
    expect(res.status).toBe(403);
  });

  it("ADMIN 访问统计 → 200", async () => {
    const { GET } = await import("@/app/api/admin/stats/route");
    const res = await callApi(GET, { cookies: cookiesOf(adminJar) });
    expect(res.status).toBe(200);
    const data = (await getData(res)) as {
      revenue: number;
      orderCount: number;
      userCount: number;
      productCount: number;
      trend: unknown[];
    };
    expect(typeof data.revenue).toBe("number");
    expect(data.orderCount).toBeGreaterThanOrEqual(0);
    expect(data.trend.length).toBe(14);
  });
});

describe("商品管理", () => {
  it("创建商品 → 列表可见 → 修改 → 归档", async () => {
    const { POST } = await import("@/app/api/admin/products/route");
    const { PUT, DELETE } = await import("@/app/api/admin/products/[id]/route");

    const sku = `IT-${Date.now()}`;
    const create = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(adminJar),
      body: {
        name: "集成测试商品",
        sku,
        price: 88.5,
        stock: 5,
        categoryId: (await prisma.category.findFirstOrThrow()).id,
        status: "DRAFT",
        description: "集成测试",
      },
    });
    expect(create.status).toBe(200);
    const created = (await getData(create)) as {
      product: { id: string; slug: string; price: number };
    };
    const product = created.product;
    createdProductId.push(product.id);
    expect(product.slug).toMatch(/^[a-z0-9-]+$/);
    expect(product.price).toBe(88.5);

    // SKU 重复被拒
    const dup = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(adminJar),
      body: {
        name: "重复SKU商品",
        sku,
        price: 10,
        stock: 1,
        categoryId: (await prisma.category.findFirstOrThrow()).id,
      },
    });
    expect(dup.status).toBe(409);

    // 更新
    const update = await callApi(PUT, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      params: { id: product.id },
      body: { price: 99.9, status: "ACTIVE" },
    });
    expect(update.status).toBe(200);

    // 库存调整
    const { PATCH } = await import("@/app/api/admin/products/[id]/stock/route");
    const stock = await callApi(PATCH, {
      method: "PATCH",
      cookies: cookiesOf(adminJar),
      params: { id: product.id },
      body: { stock: 100 },
    });
    expect(stock.status).toBe(200);

    // 归档（软删除）
    const del = await callApi(DELETE, {
      method: "DELETE",
      cookies: cookiesOf(adminJar),
      params: { id: product.id },
    });
    expect(del.status).toBe(200);
    const archived = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(archived.status).toBe("ARCHIVED");
  });
});

describe("用户管理与审计", () => {
  it("禁用/启用用户（不能禁用自己）", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "user@example.com" } });
    const { PUT } = await import("@/app/api/admin/users/[id]/status/route");

    const disable = await callApi(PUT, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      params: { id: user.id },
      body: { status: "DISABLED" },
    });
    expect(disable.status).toBe(200);

    const enable = await callApi(PUT, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      params: { id: user.id },
      body: { status: "ACTIVE" },
    });
    expect(enable.status).toBe(200);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const selfDisable = await callApi(PUT, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      params: { id: admin.id },
      body: { status: "DISABLED" },
    });
    expect(selfDisable.status).toBe(400);
  });

  it("审计日志记录登录事件", async () => {
    const { GET } = await import("@/app/api/admin/audit-logs/route");
    const res = await callApi(GET, {
      cookies: cookiesOf(adminJar),
      headers: { "x-test-url": "/api/admin/audit-logs?action=AUTH_LOGIN&pageSize=5" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { action: string }[];
      pagination: { total: number };
    };
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
    expect(body.data.every((r) => r.action === "AUTH_LOGIN")).toBe(true);
  });

  it("设置读写", async () => {
    const { GET } = await import("@/app/api/admin/settings/route");
    const { PUT } = await import("@/app/api/admin/settings/route");

    const list = await callApi(GET, { cookies: cookiesOf(adminJar) });
    expect(list.status).toBe(200);

    const update = await callApi(PUT, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      body: { siteName: "星辰商城（测试）" },
    });
    expect(update.status).toBe(200);

    // 恢复
    await callApi(PUT, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      body: { siteName: "星辰商城" },
    });
  });
});
