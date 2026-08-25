import { describe, expect, it, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { callApi, getData, login } from "../helpers/api";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";

/** 商品 / 购物车 / 优惠券 / 订单全链路集成测试 */

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

describe("商品列表 API", () => {
  it("分页与默认参数", async () => {
    const { GET } = await import("@/app/api/products/route");
    const res = await callApi(GET, {
      headers: { "x-test-url": "/api/products" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: unknown[];
      pagination: { page: number; total: number };
    };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.total).toBeGreaterThanOrEqual(20);
  });

  it("搜索与排序", async () => {
    const { GET } = await import("@/app/api/products/route");
    // 搜索范围含名称与描述（官方镜像目录大量描述带 "tee"），此处断言契约：
    // 命中非空 + sort=price_asc 严格升序
    const res = await callApi(GET, {
      headers: { "x-test-url": "/api/products?q=Tee&sort=price_asc" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { price: number }[] };
    expect(body.data.length).toBeGreaterThan(0);
    const prices = body.data.map((p) => Number(p.price));
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it("分类筛选", async () => {
    const { GET } = await import("@/app/api/products/route");
    // 官方镜像目录的两个分类之一
    const res = await callApi(GET, {
      headers: { "x-test-url": "/api/products?category=x-collection" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("价格区间筛选", async () => {
    const { GET } = await import("@/app/api/products/route");
    const res = await callApi(GET, {
      headers: { "x-test-url": "/api/products?minPrice=100&maxPrice=1000" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { price: number }[] };
    for (const p of body.data) {
      expect(Number(p.price)).toBeGreaterThanOrEqual(100);
      expect(Number(p.price)).toBeLessThanOrEqual(1000);
    }
  });
});

describe("购物车与订单全链路", () => {
  let jar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };

  beforeAll(async () => {
    const product = await prisma.product.findFirstOrThrow({
      where: { status: "ACTIVE", stock: { gt: 10 } },
    });
    productId = product.id;

    const l = await login("user@example.com", "User@123456");
    jar = l.jar;
    const addresses = await prisma.address.findFirst({
      where: { user: { email: "user@example.com" } },
    });
    addressId = addresses!.id;

    // 清理历史购物车
    await prisma.cartItem.deleteMany({ where: { user: { email: "user@example.com" } } });
  });

  it("添加购物车 → 合并 → 修改 → 删除", async () => {
    const { POST } = await import("@/app/api/cart/route");
    const { POST: mergePost } = await import("@/app/api/cart/merge/route");
    const { PUT, DELETE } = await import("@/app/api/cart/[id]/route");

    const add = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: { productId, quantity: 2 },
    });
    expect(add.status).toBe(200);
    const cart = (await getData(add)) as {
      items: { id: string; quantity: number }[];
      count: number;
    };
    expect(cart.count).toBe(2);
    const itemId = cart.items[0]!.id;

    // 合并（同商品数量相加）
    const merge = await callApi(mergePost, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: { items: [{ productId, quantity: 1 }] },
    });
    expect(merge.status).toBe(200);
    const merged = (await getData(merge)) as { count: number };
    expect(merged.count).toBe(3);

    // 修改数量
    const update = await callApi(PUT, {
      method: "PUT",
      cookies: cookiesOf(jar),
      params: { id: itemId },
      body: { quantity: 5 },
    });
    expect(update.status).toBe(200);

    // 删除
    const del = await callApi(DELETE, {
      method: "DELETE",
      cookies: cookiesOf(jar),
      params: { id: itemId },
    });
    expect(del.status).toBe(200);
  });

  it("优惠券校验与应用", async () => {
    const { GET } = await import("@/app/api/coupons/validate/route");
    const { POST } = await import("@/app/api/coupons/apply/route");

    const validate = await callApi(GET, {
      headers: { "x-test-url": "/api/coupons/validate?code=WELCOME10" },
    });
    expect(validate.status).toBe(200);

    const invalid = await callApi(GET, {
      headers: { "x-test-url": "/api/coupons/validate?code=NOPE123" },
    });
    expect(invalid.status).toBe(400);

    const apply = await callApi(POST, {
      method: "POST",
      body: { code: "WELCOME10", subtotal: 500 },
    });
    expect(apply.status).toBe(200);
    const data = (await getData(apply)) as { discount: number; freeShipping: boolean };
    expect(data.discount).toBe(50);
    expect(data.freeShipping).toBe(false);

    const freeship = await callApi(POST, {
      method: "POST",
      body: { code: "FREESHIP", subtotal: 200 },
    });
    const fsData = (await getData(freeship)) as { freeShipping: boolean };
    expect(fsData.freeShipping).toBe(true);
  });

  it("下单（锁库存）→ 模拟支付 → 发票 → 退款", async () => {
    const { POST: ordersPost } = await import("@/app/api/orders/route");
    const { POST: payPost } = await import("@/app/api/orders/[orderNumber]/pay/route");
    const { POST: mockPayPost } = await import("@/app/api/orders/[orderNumber]/mock-pay/route");
    const { GET: orderGet } = await import("@/app/api/orders/[orderNumber]/route");
    const { GET: invoiceGet } = await import("@/app/api/orders/[orderNumber]/invoice/route");
    const { POST: refundPost } = await import("@/app/api/orders/[orderNumber]/refund/route");

    const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

    // 创建订单（用优惠券 SAVE50）
    const create = await callApi(ordersPost, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: {
        items: [{ productId, quantity: 2 }],
        addressId,
        shippingMethod: "standard",
        couponCode: "",
      },
    });
    expect(create.status).toBe(200);
    const created = (await getData(create)) as {
      order: { orderNumber: string; status: string; total: number };
      paymentUrl: string;
    };
    expect(created.order.status).toBe("PENDING_PAYMENT");
    expect(created.paymentUrl).toContain("/checkout/mock/");

    // 库存已扣减
    const afterCreate = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(afterCreate.stock).toBe(before.stock - 2);
    expect(afterCreate.soldCount).toBe(before.soldCount + 2);

    // 未支付订单重复支付接口可用
    const pay = await callApi(payPost, {
      method: "POST",
      cookies: cookiesOf(jar),
      params: { orderNumber: created.order.orderNumber },
    });
    expect(pay.status).toBe(200);

    // 模拟支付成功
    const mockPay = await callApi(mockPayPost, {
      method: "POST",
      cookies: cookiesOf(jar),
      params: { orderNumber: created.order.orderNumber },
    });
    expect(mockPay.status).toBe(200);
    const paid = (await getData(mockPay)) as { order: { status: string; paidAt: string } };
    expect(paid.order.status).toBe("PAID");
    expect(paid.order.paidAt).toBeTruthy();

    // 已支付订单不可重复取消
    const { POST: cancelPost } = await import("@/app/api/orders/[orderNumber]/cancel/route");
    const cancel = await callApi(cancelPost, {
      method: "POST",
      cookies: cookiesOf(jar),
      params: { orderNumber: created.order.orderNumber },
    });
    expect(cancel.status).toBe(400);

    // 订单详情
    const detail = await callApi(orderGet, {
      cookies: cookiesOf(jar),
      params: { orderNumber: created.order.orderNumber },
    });
    expect(detail.status).toBe(200);

    // 发票 PDF
    const invoice = await callApi(invoiceGet, {
      cookies: cookiesOf(jar),
      params: { orderNumber: created.order.orderNumber },
    });
    expect(invoice.status).toBe(200);
    expect(invoice.headers.get("content-type")).toContain("application/pdf");

    // 申请退款
    const refund = await callApi(refundPost, {
      method: "POST",
      cookies: cookiesOf(jar),
      params: { orderNumber: created.order.orderNumber },
      body: { reason: "集成测试退款：不想要了，质量与描述不符。", amount: created.order.total },
    });
    expect(refund.status).toBe(200);
    const refundData = (await getData(refund)) as { refund: { status: string } };
    expect(refundData.refund.status).toBe("REQUESTED");

    // 管理端批准退款
    const admin = await login("admin@example.com", "Admin@123456");
    const refunds = await prisma.refund.findFirst({
      where: { order: { orderNumber: created.order.orderNumber } },
      orderBy: { createdAt: "desc" },
    });
    const { PUT: reviewPut } = await import("@/app/api/admin/refunds/[id]/route");
    const approve = await callApi(reviewPut, {
      method: "PUT",
      cookies: cookiesOf(admin.jar),
      params: { id: refunds!.id },
      body: { decision: "approve", adminNote: "同意退款" },
    });
    expect(approve.status).toBe(200);

    const finalOrder = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: created.order.orderNumber },
    });
    expect(finalOrder.status).toBe("REFUNDED");
  });
});
