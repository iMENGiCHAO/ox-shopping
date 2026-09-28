import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { callApi, getData, login } from "../helpers/api";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import { updateOrderStatus } from "@/server/services/order.service";

/**
 * 评价系统 + 收藏夹集成回归（交付终审补全的核心商业功能）。
 *
 * 覆盖的商业约束：
 * - 反刷评：仅 DELIVERED 订单行可评（未收货 400）、未购买者 404（归属校验）
 * - 一人一品一评：同单行重复提交 = 更新已有评价（rating 聚合跟变）
 * - 聚合冗余列：ratingAvg/ratingCount 增评/改评/下架/恢复全程重算
 * - admin 审核：REJECTED 评价前台不可见
 * - 收藏：toggle 幂等（upsert 语义）、列表带商品快照
 */

function cookiesOf(jar: { get: (n: string) => string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const v = jar.get(n);
    if (v) out[n] = v;
  }
  return out;
}

const COD_CODE = "cod-integration-test";
const REVIEW_CONTENT = "Very comfortable fabric, true to size. Would buy again!";

describe("评价系统：反刷评 / 一人一品一评 / 聚合重算 / admin 审核", () => {
  let productId: string;
  let productSlug: string;
  let userId: string;
  let otherUserId: string;
  let addressId: string;
  let userJar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };
  let otherJar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };
  let orderItemId: string;
  let orderNumber: string;
  const createdOrders: string[] = [];
  let reviewId = "";
  let createdMethodId: string | null = null;

  beforeAll(async () => {
    // COD 配送方式（测试库可能没有）：COD 单创建即 PROCESSING，省去支付环节
    const existing = await prisma.shippingMethod.findUnique({ where: { code: COD_CODE } });
    if (!existing) {
      createdMethodId = (
        await prisma.shippingMethod.create({
          data: {
            code: COD_CODE,
            name: "货到付款（评价测试）",
            nameEn: "Cash on delivery (review test)",
            fee: "7.00",
            isCashOnDelivery: true,
            isActive: true,
            sortOrder: 999,
          },
        })
      ).id;
    }

    const l = await login("user@example.com", "User@123456");
    userJar = l.jar;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: "user@example.com" } })).id;
    const o = await login("admin@example.com", "Admin@123456");
    otherJar = o.jar; // admin 账号充当「未购买者」
    otherUserId = (await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } })).id;

    const product = await prisma.product.findFirstOrThrow({
      where: { status: "ACTIVE", stock: { gt: 5 } },
    });
    productId = product.id;
    productSlug = product.slug;

    const addr = await prisma.address.create({
      data: {
        userId,
        recipientName: "Review Tester",
        phone: "+86 13800001111",
        province: "Beijing",
        city: "Beijing",
        district: "Chaoyang",
        detail: "Test Road 1, Review Building",
        isDefault: false,
        country: "CN",
      },
    });
    addressId = addr.id;
  });

  afterAll(async () => {
    // 清理：评价/收藏/订单/地址（test 库共享，别污染后续轮次）
    await prisma.review.deleteMany({ where: { productId } });
    await prisma.favorite.deleteMany({ where: { userId } });
    for (const on of createdOrders) {
      await prisma.order.deleteMany({ where: { orderNumber: on } }).catch(() => {});
    }
    await prisma.address.deleteMany({ where: { id: addressId } }).catch(() => {});
    // 只清理本文件创建的配送方式（预存的别动）
    if (createdMethodId) {
      await prisma.shippingMethod.deleteMany({ where: { id: createdMethodId } }).catch(() => {});
    }
    await prisma.product.update({
      where: { id: productId },
      data: { ratingAvg: 0, ratingCount: 0 },
    }).catch(() => {});
  });

  async function createCodOrder(): Promise<void> {
    const { POST } = await import("@/app/api/orders/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: {
        items: [{ productId, quantity: 1 }],
        addressId,
        shippingMethod: COD_CODE,
        contactEmail: null,
      },
    });
    expect(res.status).toBe(200);
    const data = (await getData(res)) as { order: { orderNumber: string } };
    orderNumber = data.order.orderNumber;
    createdOrders.push(orderNumber);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { order: { orderNumber } } });
    orderItemId = item.id;
  }

  async function submitReview(
    jar: { get: (n: string) => string | undefined },
    rating: number,
    content = REVIEW_CONTENT,
  ) {
    const { POST } = await import("@/app/api/user/reviews/route");
    return callApi(POST, {
      method: "POST",
      cookies: cookiesOf(jar),
      body: JSON.stringify({ orderItemId, rating, title: null, content }),
      headers: { "content-type": "application/json" },
    });
  }

  it("未收货（PROCESSING）不能评价 —— 400", async () => {
    await createCodOrder();
    const res = await submitReview(userJar, 5);
    expect(res.status).toBe(400);
  });

  it("未购买者（订单不归属）提交 —— 404 归属校验", async () => {
    // 状态机不允许跳步：PROCESSING → SHIPPED → DELIVERED（与后台真实操作一致）
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
      include: { items: true },
    });
    await updateOrderStatus(order, "SHIPPED", null, {
      trackingCompany: "Test Express",
      trackingNumber: "T123456789",
    });
    const shipped = await prisma.order.findUniqueOrThrow({
      where: { orderNumber },
      include: { items: true },
    });
    await updateOrderStatus(shipped, "DELIVERED", null);
    const res = await submitReview(otherJar, 5);
    expect(res.status).toBe(404);
  });

  it("DELIVERED 后本人可评：公开列表可见 + 聚合正确", async () => {
    const res = await submitReview(userJar, 5);
    expect(res.status).toBe(200);
    const data = (await getData(res)) as { review: { id: string } };
    reviewId = data.review.id;

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.ratingCount).toBe(1);
    expect(product.ratingAvg).toBe(5);

    const { GET } = await import("@/app/api/products/[slug]/reviews/route");
    const pub = await callApi(GET, {
      method: "GET",
      params: { slug: productSlug },
      headers: { "x-test-url": `/api/products/${productSlug}/reviews` },
    });
    expect(pub.status).toBe(200);
    const pubData = (await getData(pub)) as { rows: { id: string }[]; total: number };
    expect(pubData.total).toBe(1);
    expect(pubData.rows[0]!.id).toBe(reviewId);
  });

  it("同一订单行重复提交 = 更新已有评价（rating 5→3 聚合跟变）", async () => {
    const res = await submitReview(userJar, 3);
    expect(res.status).toBe(200);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.ratingCount).toBe(1); // 仍是 1 条（更新不新增）
    expect(product.ratingAvg).toBe(3);
  });

  it("admin 下架 → 前台不可见 + 聚合清零；恢复 → 回来", async () => {
    const { PATCH } = await import("@/app/api/admin/reviews/[id]/route");
    const hide = await callApi(PATCH, {
      method: "PATCH",
      cookies: cookiesOf(otherJar),
      params: { id: reviewId },
      body: JSON.stringify({ status: "REJECTED" }),
      headers: {
        "content-type": "application/json",
        "x-test-url": `/api/admin/reviews/${reviewId}`,
      },
    });
    expect(hide.status).toBe(200);

    let product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.ratingCount).toBe(0);
    expect(product.ratingAvg).toBe(0);

    const { GET } = await import("@/app/api/products/[slug]/reviews/route");
    const pub = await callApi(GET, {
      method: "GET",
      params: { slug: productSlug },
      headers: { "x-test-url": `/api/products/${productSlug}/reviews` },
    });
    const pubData = (await getData(pub)) as { total: number };
    expect(pubData.total).toBe(0);

    const restore = await callApi(PATCH, {
      method: "PATCH",
      cookies: cookiesOf(otherJar),
      params: { id: reviewId },
      body: JSON.stringify({ status: "APPROVED" }),
      headers: {
        "content-type": "application/json",
        "x-test-url": `/api/admin/reviews/${reviewId}`,
      },
    });
    expect(restore.status).toBe(200);
    product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.ratingCount).toBe(1);
    expect(product.ratingAvg).toBe(3);
  });

  it("可评价行清单：DELIVERED 单的行已评 → reviewed=true", async () => {
    const { GET } = await import("@/app/api/user/reviewable/[orderNumber]/route");
    const res = await callApi(GET, {
      method: "GET",
      cookies: cookiesOf(userJar),
      params: { orderNumber },
      headers: { "x-test-url": `/api/user/reviewable/${orderNumber}` },
    });
    expect(res.status).toBe(200);
    const data = (await getData(res)) as {
      reviewable: boolean;
      rows: { orderItemId: string; reviewed: boolean }[];
    };
    expect(data.reviewable).toBe(true);
    const row = data.rows.find((r) => r.orderItemId === orderItemId);
    expect(row?.reviewed).toBe(true);
  });
});

describe("收藏夹：toggle 幂等 / 列表快照 / 登录墙", () => {
  let userId: string;
  let userJar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };
  let productId: string;

  beforeAll(async () => {
    const l = await login("user@example.com", "User@123456");
    userJar = l.jar;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: "user@example.com" } })).id;
    const product = await prisma.product.findFirstOrThrow({ where: { status: "ACTIVE" } });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.favorite.deleteMany({ where: { userId, productId } });
  });

  it("登录用户 toggle：加入 → 列表可见 → 再 toggle 移除", async () => {
    const { POST } = await import("@/app/api/user/favorites/route");
    const add = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: JSON.stringify({ productId }),
      headers: { "content-type": "application/json" },
    });
    expect(add.status).toBe(200);
    expect(((await getData(add)) as { favorited: boolean }).favorited).toBe(true);

    const { GET } = await import("@/app/api/user/favorites/route");
    const list = await callApi(GET, {
      method: "GET",
      cookies: cookiesOf(userJar),
      headers: { "x-test-url": "/api/user/favorites" },
    });
    const data = (await getData(list)) as { rows: { product: { id: string } }[]; total: number };
    expect(data.total).toBe(1);
    expect(data.rows[0]!.product.id).toBe(productId);

    const remove = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: JSON.stringify({ productId }),
      headers: { "content-type": "application/json" },
    });
    expect(((await getData(remove)) as { favorited: boolean }).favorited).toBe(false);
    const list2 = await callApi(GET, {
      method: "GET",
      cookies: cookiesOf(userJar),
      headers: { "x-test-url": "/api/user/favorites" },
    });
    expect(((await getData(list2)) as { total: number }).total).toBe(0);
  });

  it("游客（无会话）toggle —— 401 登录墙", async () => {
    const { POST } = await import("@/app/api/user/favorites/route");
    const res = await callApi(POST, {
      method: "POST",
      body: JSON.stringify({ productId }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });
});
