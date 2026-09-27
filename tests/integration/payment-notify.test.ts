import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { callApi, getData, login } from "../helpers/api";
import { resetRateLimit } from "@/lib/rate-limit";
import { encryptChannelConfig } from "@/lib/payment/channel-crypto";
import { buildAlipaySignContent, signWithRsa } from "@/lib/payment/signature";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";

/**
 * 支付异步回调（/api/pay/notify/[channelCode]）—— **真实收款链路**的集成测试。
 *
 * 为什么单独写这个文件：此前 `tests/integration` 里没有任何支付回调测试，
 * 而这条链路一旦出错就是**丢钱或重复发货**：
 *   - 验签失败却仍把订单置为已付 → 白送商品
 *   - 金额与订单不符却仍置为已付 → 按应收记账、按实收收款，差额成坏账
 *   - 重复回调被当成两次支付 → 重复发货 / 重复写资金流水
 *   - 回调里的币种与订单币种不一致 → 跨币种比数值（100 USD ≠ 100 CNY）
 *
 * 用**真实 RSA 密钥对**构造回调：签名由被测代码自己的 signWithRsa 生成，
 * 渠道公钥写进渠道配置，因此验签走的是与生产完全相同的路径。
 */

const CHANNEL_CODE = "alipay";
let privateKeyPem: string;
let publicKeyPem: string;
let originalChannelEnabled = false;

let productId: string;
let addressId: string;
let userId: string;
let userJar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };

function cookiesOf(jar: { get: (n: string) => string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const v = jar.get(n);
    if (v) out[n] = v;
  }
  return out;
}

/**
 * 建一张 PENDING_PAYMENT 订单，返回单号与应付总额。
 *
 * `currency` 默认 CNY（= 测试环境的站点币种），**显式写库**而不是依赖环境默认值：
 * 测试 #8 需要一张「渠道不支持币种」的订单，依赖 `.env.test` 的 CURRENCY 是隐式依赖，
 * 环境一改用例就静默失效。写库只改币种字段、**不动 total**，
 * 因此金额核对的断言不受影响（金额守卫与币种守卫是两条独立分支）。
 */
async function createOrder(currency = "CNY"): Promise<{ orderNumber: string; total: number }> {
  // 建单接口有防刷单限流（`order-create:<userId>`，5 单/600s）。本文件需要建多张单
  // 覆盖不同断言，因此在建单前清掉该用户的计数窗口。
  // 用的是生产代码导出的 resetRateLimit（与「登录成功后清除失败计数」同一条路径），
  // **不放宽也不绕过限流阈值**；限流行为本身由 tests/unit/rate-limit.test.ts 覆盖。
  await resetRateLimit(`order-create:${userId}`);

  const { POST } = await import("@/app/api/orders/route");
  const res = await callApi(POST, {
    method: "POST",
    cookies: cookiesOf(userJar),
    body: { items: [{ productId, quantity: 1 }], addressId, shippingMethod: "standard" },
  });
  expect(res.status).toBe(200);
  const data = (await getData(res)) as {
    order: { orderNumber: string; total: number; status: string };
  };
  expect(data.order.status).toBe("PENDING_PAYMENT");

  await prisma.order.update({
    where: { orderNumber: data.order.orderNumber },
    data: { currency },
  });
  return { orderNumber: data.order.orderNumber, total: data.order.total };
}

/** 构造一次支付宝异步通知：签名原文由被测代码自己的 buildAlipaySignContent 生成 */
function alipayNotifyParams(orderNumber: string, amount: number, transactionId: string) {
  return {
    app_id: "2021000000000000",
    charset: "utf-8",
    notify_id: `nid_${transactionId}`,
    out_trade_no: orderNumber,
    sign_type: "RSA2",
    trade_no: transactionId,
    trade_status: "TRADE_SUCCESS",
    total_amount: amount.toFixed(2),
  } as Record<string, string>;
}

async function sendNotify(
  params: Record<string, string>,
  opts: { tamperSignature?: boolean; omitSignature?: boolean } = {},
) {
  const { POST } = await import("@/app/api/pay/notify/[channelCode]/route");
  const content = buildAlipaySignContent(params);
  const sign = signWithRsa(privateKeyPem, content);
  const payload: Record<string, string> = { ...params };
  if (!opts.omitSignature) {
    payload.sign = opts.tamperSignature ? sign.slice(0, -4) + "AAAA" : sign;
  }
  const body = new URLSearchParams(payload).toString();
  return callApi(POST, {
    method: "POST",
    params: { channelCode: CHANNEL_CODE },
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

async function statusOf(orderNumber: string) {
  return prisma.order.findUniqueOrThrow({ where: { orderNumber } });
}

describe("支付异步回调：验签 / 金额核对 / 幂等 / 币种", () => {
  beforeAll(async () => {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();

    const existing = await prisma.paymentChannel.findUnique({ where: { code: CHANNEL_CODE } });
    originalChannelEnabled = existing?.enabled ?? false;
    await prisma.paymentChannel.upsert({
      where: { code: CHANNEL_CODE },
      update: {
        enabled: true,
        configEncrypted: encryptChannelConfig({
          appId: "2021000000000000",
          alipayPublicKey: publicKeyPem,
          gatewayUrl: "https://openapi.alipay.com/gateway.do",
        }),
      },
      create: {
        code: CHANNEL_CODE,
        name: "支付宝",
        provider: "alipay",
        enabled: true,
        sortOrder: 10,
        configEncrypted: encryptChannelConfig({
          appId: "2021000000000000",
          alipayPublicKey: publicKeyPem,
          gatewayUrl: "https://openapi.alipay.com/gateway.do",
        }),
      },
    });

    const product = await prisma.product.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { stock: "desc" },
    });
    productId = product.id;
    if (product.stock < 20) {
      await prisma.product.update({ where: { id: productId }, data: { stock: 200 } });
    }

    userJar = (await login("user@example.com", "User@123456")).jar;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "user@example.com" } });
    userId = user.id;
    const address = await prisma.address.findFirstOrThrow({ where: { userId: user.id } });
    addressId = address.id;
  }, 240_000);

  afterAll(async () => {
    // 还原渠道状态，避免影响其它测试文件（admin 渠道列表等）
    await prisma.paymentChannel.update({
      where: { code: CHANNEL_CODE },
      data: { enabled: originalChannelEnabled },
    });
  });

  it("验签通过 + 金额一致 → 订单置为已付，并按支付宝要求应答 success", async () => {
    const { orderNumber, total } = await createOrder("CNY");
    const res = await sendNotify(alipayNotifyParams(orderNumber, total, `txn_ok_${orderNumber}`));

    expect(res.status).toBe(200);
    // 支付宝要求纯文本 "success"，否则会持续重试
    expect(await res.text()).toBe("success");

    const order = await statusOf(orderNumber);
    expect(order.status).toBe("PAID");
    expect(order.paidAt).not.toBeNull();
    expect(order.paymentId).toBe(`txn_ok_${orderNumber}`);
  });

  it("签名被篡改 → 400 且订单仍未支付", async () => {
    const { orderNumber, total } = await createOrder("CNY");
    const res = await sendNotify(
      alipayNotifyParams(orderNumber, total, `txn_badsig_${orderNumber}`),
      { tamperSignature: true },
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("fail");
    expect((await statusOf(orderNumber)).status).toBe("PENDING_PAYMENT");
  });

  it("完全不带签名 → 400 且订单仍未支付", async () => {
    const { orderNumber, total } = await createOrder("CNY");
    const res = await sendNotify(alipayNotifyParams(orderNumber, total, `txn_nosig_${orderNumber}`), {
      omitSignature: true,
    });

    expect(res.status).toBe(400);
    expect((await statusOf(orderNumber)).status).toBe("PENDING_PAYMENT");
  });

  it("**实收少于应收** → 拒绝，订单不得置为已付（坏账防线）", async () => {
    const { orderNumber, total } = await createOrder("CNY");
    const underpaid = Math.max(0.01, Math.round((total - 1) * 100) / 100);
    const res = await sendNotify(
      alipayNotifyParams(orderNumber, underpaid, `txn_under_${orderNumber}`),
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("fail");
    const order = await statusOf(orderNumber);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.paidAt).toBeNull();
  });

  it("**实收多于应收** → 同样拒绝（多收也不能自动入账）", async () => {
    const { orderNumber, total } = await createOrder("CNY");
    const res = await sendNotify(
      alipayNotifyParams(orderNumber, Math.round((total + 5) * 100) / 100, `txn_over_${orderNumber}`),
    );

    expect(res.status).toBe(400);
    expect((await statusOf(orderNumber)).status).toBe("PENDING_PAYMENT");
  });

  /**
   * 边界：**差 1 分也必须拒绝**（精确到分，不设浮点容差）。
   *
   * 这条用例最初写反了 —— 断言「差 1 分应被接受（容差 0.01）」，结果失败，
   * 从而暴露出判据本身的问题：`90.01 - 90 === 0.010000000000005116`，
   * 在 IEEE754 下**大于** 0.01，所以「刚好差 1 分」被判成超容差。
   * 根因不是容差调得不够大，而是用浮点减法做金额判据。
   * 现在两侧都换算成整数分再比较，这个边界因此是确定性的。
   */
  it("金额相差 1 分 → 同样拒绝（金额判据精确到分）", async () => {
    const { orderNumber, total } = await createOrder("CNY");
    const res = await sendNotify(
      alipayNotifyParams(orderNumber, Math.round((total + 0.01) * 100) / 100, `txn_eps_${orderNumber}`),
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("fail");
    const order = await statusOf(orderNumber);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.paidAt).toBeNull();
  });

  it("重复回调是幂等的：只入账一次，paidAt 不被覆盖", async () => {
    const { orderNumber, total } = await createOrder("CNY");
    const params = alipayNotifyParams(orderNumber, total, `txn_dup_${orderNumber}`);

    const first = await sendNotify(params);
    expect(first.status).toBe(200);
    const afterFirst = await statusOf(orderNumber);
    expect(afterFirst.status).toBe("PAID");

    const second = await sendNotify(params);
    expect(second.status).toBe(200); // 仍要应答成功，否则网关会一直重试

    const afterSecond = await statusOf(orderNumber);
    expect(afterSecond.status).toBe("PAID");
    // 原子认领生效：第二次不能重新写 paidAt
    expect(afterSecond.paidAt?.getTime()).toBe(afterFirst.paidAt?.getTime());

    // 资金流水只应有一条 paid（logPayment 是 fire-and-forget，轮询等它落库）
    let paidLogs = 0;
    for (let i = 0; i < 40; i++) {
      paidLogs = await prisma.paymentLog.count({
        where: { orderId: afterFirst.id, event: "paid" },
      });
      if (paidLogs >= 1) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(paidLogs).toBe(1);
  });

  it("已取消订单收到迟到支付 → 钱绝不入账（自动退款兜底，D1 资金洞修复）", async () => {
    const { orderNumber, total } = await createOrder("CNY");
    // 模拟 30 分钟超时被系统自动取消（库存/券已回补、货已释放）
    await prisma.order.update({
      where: { orderNumber },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    // 网关侧仍完成支付（支付宝二维码有效期远长于订单 30 分钟）→ 迟到回调
    const res = await sendNotify(alipayNotifyParams(orderNumber, total, `txn_late_${orderNumber}`));

    // alipay.refund 尚未接真实网关（provider stub 抛错）→ 路由 catch →
    // replyFail(400 "fail")：网关按自身策略重发回调（= 自动重试退款），
    // error 告警已发（人工介入通道）。
    expect(await res.text()).not.toBe("success");
    const order = await statusOf(orderNumber);
    // 资金断言（本用例的根本）：无论应答如何，钱都不得入账 ——
    // 订单保持 CANCELLED、paidAt 不写、交易号不认领、绝不静默吞钱。
    expect(order.status).toBe("CANCELLED");
    expect(order.paidAt).toBeNull();
    expect(order.paymentId).toBeNull();
  });

  it("币种与渠道不匹配（USD 订单收到支付宝回调）→ 拒绝", async () => {
    // 支付宝渠道声明 supportedCurrencies:["CNY"]，USD 订单必须被拦下：
    // 跨币种直接比数值是错的（45 USD ≠ 45 CNY），
    // 若只比金额不比币种，这单会被误判为「已足额支付」。
    const { orderNumber, total } = await createOrder("USD");
    const res = await sendNotify(
      alipayNotifyParams(orderNumber, total, `txn_cur_${orderNumber}`),
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("fail");
    const order = await statusOf(orderNumber);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.paidAt).toBeNull();
  });

  it("回调引用的订单不存在 → 400（不能 500，否则网关会无限重试）", async () => {
    const res = await sendNotify(alipayNotifyParams("ORD_DOES_NOT_EXIST_0001", 10, "txn_ghost"));
    expect(res.status).toBe(400);
  });

  it("渠道未启用 → 400", async () => {
    await prisma.paymentChannel.update({ where: { code: CHANNEL_CODE }, data: { enabled: false } });
    try {
      const { orderNumber, total } = await createOrder("CNY");
      const res = await sendNotify(alipayNotifyParams(orderNumber, total, `txn_off_${orderNumber}`));
      expect(res.status).toBe(400);
      expect((await statusOf(orderNumber)).status).toBe("PENDING_PAYMENT");
    } finally {
      await prisma.paymentChannel.update({ where: { code: CHANNEL_CODE }, data: { enabled: true } });
    }
  });

  it("渠道不存在 → 404", async () => {
    const { POST } = await import("@/app/api/pay/notify/[channelCode]/route");
    const res = await callApi(POST, {
      method: "POST",
      params: { channelCode: "no-such-channel" },
      body: "a=1",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.status).toBe(404);
  });
});
