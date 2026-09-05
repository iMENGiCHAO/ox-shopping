import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { callApi, getData, login } from "../helpers/api";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";

/**
 * P2-1：specStock 一致性治理。
 * 1. 跨入口守恒：admin 建商品(带规格库存) → 下单扣减 → 取消回补，断言 specStock 守恒；
 * 2. 校验：孤儿规格组/值（不在 attributes 中）被拒（400）。
 */

function cookiesOf(jar: { get: (n: string) => string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const v = jar.get(n);
    if (v) out[n] = v;
  }
  return out;
}

type SpecStock = Record<string, Record<string, number>>;

describe("specStock 一致性（P2-1）", () => {
  let adminJar: { get: (n: string) => string | undefined };
  let userJar: { get: (n: string) => string | undefined };
  let categoryId: string;
  const productIds: string[] = [];
  const orderNumbers: string[] = [];

  beforeAll(async () => {
    adminJar = (await login("admin@example.com", "Admin@123456")).jar;
    userJar = (await login("user@example.com", "User@123456")).jar;
    categoryId = (await prisma.category.findFirstOrThrow()).id;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { orderNumber: { in: orderNumbers } } } });
    await prisma.order.deleteMany({ where: { orderNumber: { in: orderNumbers } } });
    if (productIds.length > 0) await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  });

  async function specOf(productId: string): Promise<SpecStock> {
    const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    return (p.specStock ?? {}) as unknown as SpecStock;
  }

  it("孤儿规格组被拒（specStock 组不在 attributes）", async () => {
    const { POST } = await import("@/app/api/admin/products/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(adminJar),
      body: {
        name: "孤儿规格组商品",
        sku: `ORPHAN-${Date.now()}`,
        price: 50,
        stock: 5,
        categoryId,
        attributes: [{ name: "Color", values: ["Black"] }],
        specStock: { Size: { M: 3 } }, // Size 不在 attributes，应被拒
      },
    });
    expect(res.status).toBe(400);
  });

  it("孤儿规格值被拒（值不在属性可选值）", async () => {
    const { POST } = await import("@/app/api/admin/products/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(adminJar),
      body: {
        name: "孤儿规格值商品",
        sku: `ORPHV-${Date.now()}`,
        price: 50,
        stock: 5,
        categoryId,
        attributes: [{ name: "Color", values: ["Black"] }],
        specStock: { Color: { White: 3 } }, // White 不在 Color.values，应被拒
      },
    });
    expect(res.status).toBe(400);
  });

  it("下单扣减 → 取消回补，specStock 守恒", async () => {
    const { POST: productPost } = await import("@/app/api/admin/products/route");
    const { POST: ordersPost } = await import("@/app/api/orders/route");
    const { POST: cancelPost } = await import("@/app/api/orders/[orderNumber]/cancel/route");
    const { POST: addrPost } = await import("@/app/api/user/addresses/route");

    const sku = `SPEC-${Date.now()}`;
    const create = await callApi(productPost, {
      method: "POST",
      cookies: cookiesOf(adminJar),
      body: {
        name: "规格库存守恒商品",
        sku,
        price: 99,
        stock: 8,
        categoryId,
        status: "ACTIVE",
        attributes: [{ name: "Color", values: ["Black", "White"] }],
        specStock: { Color: { Black: 5, White: 3 } },
      },
    });
    expect(create.status).toBe(200);
    const product = ((await getData(create)) as { product: { id: string } }).product;
    productIds.push(product.id);

    // 下单前：Black=5 White=3
    expect(await specOf(product.id)).toEqual({ Color: { Black: 5, White: 3 } });

    // 收货地址
    const addr = await callApi(addrPost, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: {
        recipientName: "守恒测试",
        phone: "13800138000",
        province: "广东省",
        city: "深圳市",
        district: "南山区",
        detail: "科技园 1 号",
        isDefault: false,
      },
    });
    const addressId = ((await getData(addr)) as { address: { id: string } }).address.id;

    // 下单：买 2 件 Black（触发 specStock Black 5→3）
    const order = await callApi(ordersPost, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: {
        items: [{ productId: product.id, quantity: 2, attributes: [{ name: "Color", value: "Black" }] }],
        addressId,
        shippingMethod: "standard",
        couponCode: "",
      },
    });
    expect(order.status).toBe(200);
    const orderNumber = ((await getData(order)) as { order: { orderNumber: string } }).order.orderNumber;
    orderNumbers.push(orderNumber);

    // 下单后：Black=3 White=3（守恒：只扣被选中的规格）
    expect(await specOf(product.id)).toEqual({ Color: { Black: 3, White: 3 } });

    // 取消订单 → 回补 Black 3→5
    const cancel = await callApi(cancelPost, {
      method: "POST",
      cookies: cookiesOf(userJar),
      params: { orderNumber },
    });
    expect(cancel.status).toBe(200);

    // 回补后：Black=5 White=3（完全守恒）
    expect(await specOf(product.id)).toEqual({ Color: { Black: 5, White: 3 } });
  });
});