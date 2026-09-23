import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CookieJar, callApi, getData, login, testClientKey } from "../helpers/api";
import { prisma } from "@/lib/prisma";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import { DIST_REF_COOKIE } from "@/lib/distribution/contract";
import { signRefCookie } from "@/lib/distribution/referral";
import { resetRateLimit } from "@/lib/rate-limit";

/**
 * 分销 / 多级佣金 集成测试。
 *
 * 覆盖商业口径（这些规则错一条就是真金白银的错账）：
 *   · 注册携带推广码 → 绑定 + 推广人自动成为分销商（无需审核）
 *   · 客户复购不看链接、只看绑定（首次绑定定终身）
 *   · 不可抢绑：已绑定客户再点别人链接不覆盖
 *   · 自然流量订单不产生任何佣金
 *   · 支付成功后按关系链逐级计佣（金额/层级/比例精确到分）
 *   · 自购不给自已一级佣金，但上级照常分
 *   · 确认收货 → 立即结算入余额；退款 → 冲正并扣回已入账金额
 *   · 提现：申请冻结 → 审核通过 → 打款核销 / 驳回解冻退回
 *   · 行级权限 + 服务端脱敏（手机号/邮箱/详细地址）
 *   · 对账补偿：漏记归属/漏算佣金能被扫平
 */

const SUITE = `dist-${Date.now()}`;
const email = (tag: string) => `${SUITE}-${tag}@test.local`;
const PASSWORD = "User@123456";

type Actor = { userId: string; jar: CookieJar; email: string };

function cookiesOf(jar: CookieJar): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const v = jar.get(n);
    if (v) out[n] = v;
  }
  return out;
}

/** 走真实注册路由建号（可携带推广 cookie），这样注册钩子也在被测范围内 */
async function registerUser(tag: string, refCode?: string): Promise<Actor> {
  // 注册限流是进程内单 IP 3 次/分钟，本文件要建多个账号 → 逐个清零
  for (const ip of ["unknown", "127.0.0.1", testClientKey()])
    await resetRateLimit(`register:${ip}`);

  const { POST } = await import("@/app/api/auth/register/route");
  const mail = email(tag);
  const res = await callApi(POST, {
    method: "POST",
    body: { email: mail, name: `分销测试${tag}`, password: PASSWORD },
    ...(refCode ? { cookies: { [DIST_REF_COOKIE]: signRefCookie(refCode) } } : {}),
  });
  expect(res.status).toBe(200);
  const jar = new CookieJar();
  jar.absorb(res);
  const data = (await getData(res)) as { user: { id: string } };

  await prisma.address.create({
    data: {
      userId: data.user.id,
      recipientName: `收件人${tag}`,
      phone: "13812345678",
      province: "广东省",
      city: "深圳市",
      district: "南山区",
      detail: "科技园 1 号",
      isDefault: true,
    },
  });
  return { userId: data.user.id, jar, email: mail };
}

/** 取（必要时生成）推广码 */
async function codeOf(userId: string): Promise<string> {
  const { ensureReferralCode } = await import("@/server/services/distribution");
  return ensureReferralCode(userId);
}

/** 下单（走真实路由，可带推广 cookie） */
async function placeOrder(
  actor: Actor,
  refCode?: string,
): Promise<{ orderId: string; orderNumber: string }> {
  const product = await prisma.product.findFirstOrThrow({
    where: { status: "ACTIVE", stock: { gt: 5 } },
  });
  const myAddress = await prisma.address.findFirstOrThrow({
    where: { userId: actor.userId },
    orderBy: { createdAt: "desc" },
  });

  // 下单限流是「单用户 5 单/10 分钟」，本文件用例多，逐个清零避免互相干扰
  await resetRateLimit(`order-create:${actor.userId}`);
  for (const ip of ["unknown", "127.0.0.1"]) await resetRateLimit(`order-create-ip:${ip}`);

  const { POST } = await import("@/app/api/orders/route");
  const res = await callApi(POST, {
    method: "POST",
    cookies: {
      ...cookiesOf(actor.jar),
      ...(refCode ? { [DIST_REF_COOKIE]: signRefCookie(refCode) } : {}),
    },
    body: {
      items: [{ productId: product.id, quantity: 1 }],
      addressId: myAddress.id,
      shippingMethod: "standard",
    },
  });
  expect(res.status).toBe(200);
  const data = (await getData(res)) as { order: { id: string; orderNumber: string } };
  return { orderId: data.order.id, orderNumber: data.order.orderNumber };
}

/** 模拟支付（真实路由 → markOrderPaid → 分销计佣钩子） */
async function payOrder(actor: Actor, orderNumber: string): Promise<void> {
  const { POST } = await import("@/app/api/orders/[orderNumber]/mock-pay/route");
  const res = await callApi(POST, {
    method: "POST",
    cookies: cookiesOf(actor.jar),
    params: { orderNumber },
  });
  expect(res.status).toBe(200);
}

async function adminId(): Promise<string> {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@example.com" },
    select: { id: true },
  });
  return admin.id;
}

let root: Actor;
let l1: Actor;
let l2: Actor;
let buyer: Actor;
let rootCode: string;
let l1Code: string;
let l2Code: string;
let adminJar: CookieJar;

beforeAll(async () => {
  adminJar = (await login("admin@example.com", "Admin@123456")).jar;

  // 推广链：root 邀请 l1、l1 邀请 l2、l2 邀请 buyer。
  // buyer 下单归属 l2，分佣链 = l2(1) → l1(2) → root(3)，默认配置 3 级 → 三人都有佣金。
  root = await registerUser("root");
  rootCode = await codeOf(root.userId);
  l1 = await registerUser("l1", rootCode);
  l1Code = await codeOf(l1.userId);
  l2 = await registerUser("l2", l1Code);
  l2Code = await codeOf(l2.userId);
  buyer = await registerUser("buyer", l2Code);
  // 本项目在外置机械卷上跑，冷启动时一次 bcrypt + 多次 DB 往返可能远超默认 90s hook 超时
}, 300_000);

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: SUITE } } });
});

/* 本文件是重型集成链路（注册→绑定→下单→支付→退款→结算→提现），
   单条用例在慢盘 + 并发负载下会超过 vitest 默认的 60s。这里为本文件统一放宽，
   而不是把全局默认调大（单元测试仍需快速失败）。 */
vi.setConfig({ testTimeout: 150_000 });

describe("绑定与自动升级", () => {
  it("注册携带推广码 → 建立绑定，推广人自动成为分销商", async () => {
    const bind = await prisma.distributorCustomerBind.findUnique({
      where: { customerId: l2.userId },
    });
    expect(bind?.distributorId).toBe(l1.userId);
    expect(bind?.status).toBe("ACTIVE");

    const l1User = await prisma.user.findUniqueOrThrow({ where: { id: l1.userId } });
    expect(l1User.isDistributor).toBe(true);
    expect(l1User.firstPromoteAt).not.toBeNull();
    expect(l1User.referralCode).toBe(l1Code);
  });

  it("闭包表继承整条上级链（跨级分佣不断链）", async () => {
    const { getClosure, getCommissionChain } = await import("@/server/services/distribution");

    // 归属分销商 l2 的闭包：自己 + 上级 l1 + l1 的上级 root
    const closure = await getClosure(l2.userId);
    const depths = new Map(closure.map((c) => [c.userId, c.depth]));
    expect(depths.get(l2.userId)).toBe(0);
    expect(depths.get(l1.userId)).toBe(1);
    expect(depths.get(root.userId)).toBe(2);

    // 分佣链把「归属分销商本人」平移到 depth=1
    const chain = new Map((await getCommissionChain(l2.userId)).map((c) => [c.userId, c.depth]));
    expect(chain.get(l2.userId)).toBe(1);
    expect(chain.get(l1.userId)).toBe(2);
    expect(chain.get(root.userId)).toBe(3);
    expect(chain.has(buyer.userId)).toBe(false);

    // 纯客户不进分销树（否则「团队人数」会把普通客户算进来）
    expect(await getClosure(buyer.userId)).toHaveLength(0);
    const buyerUser = await prisma.user.findUniqueOrThrow({ where: { id: buyer.userId } });
    expect(buyerUser.isDistributor).toBe(false);
    expect(buyerUser.invitedById).toBe(l2.userId);
  });

  it("不可抢绑：已绑定客户再用别人的码绑定无效，归属不变", async () => {
    const { bindCustomer } = await import("@/server/services/distribution");
    const result = await bindCustomer({ customerId: buyer.userId, code: rootCode });
    expect(["REBIND_DISABLED", "ALREADY_BOUND_OTHER"]).toContain(result.outcome);
    const bind = await prisma.distributorCustomerBind.findUniqueOrThrow({
      where: { customerId: buyer.userId },
    });
    expect(bind.distributorId).toBe(l2.userId);
  });

  it("循环绑定防护：上级不能作为客户绑回自己的下级（防互刷返佣）", async () => {
    const { bindCustomer } = await import("@/server/services/distribution");
    // 场景：root 是 l1 的上级（l1 用 rootCode 注册而来）。
    // 若允许 root 作为**客户**再绑 l1 的码，闭包成环 → 双方互相返佣（互刷）。
    // 买家本人的自购佣金规则挡不住这种链路，必须由绑定期拦截。
    const l1Code = await codeOf(l1.userId);
    const result = await bindCustomer({ customerId: root.userId, code: l1Code });
    expect(result.outcome).toBe("CYCLE");
    // 不得留下任何绑定记录
    const bind = await prisma.distributorCustomerBind.findUnique({
      where: { customerId: root.userId },
    });
    expect(bind).toBeNull();
  });

  it("双重身份并存：他作为客户的上级 = 他作为分销商的上线", async () => {
    const bind = await prisma.distributorCustomerBind.findUniqueOrThrow({
      where: { customerId: l2.userId },
    });
    expect(bind.distributorId).toBe(l1.userId);
    const asDistributor = await prisma.distributorCustomerBind.count({
      where: { distributorId: l2.userId, status: "ACTIVE" },
    });
    expect(asDistributor).toBe(1);
  });
});

describe("订单归属与逐级分佣", () => {
  let orderId = "";
  let orderNumber = "";

  it("自然流量用户下单 → 无归属、无佣金", async () => {
    const anon = await registerUser("natural");
    const order = await placeOrder(anon);
    await payOrder(anon, order.orderNumber);
    const attr = await prisma.orderAttribution.findUniqueOrThrow({
      where: { orderId: order.orderId },
    });
    expect(attr.natural).toBe(true);
    expect(attr.distributorId).toBeNull();
    expect(await prisma.commissionLog.count({ where: { orderId: order.orderId } })).toBe(0);
  });

  it("复购不看链接：第二次下单拿别人的码也仍归原分销商", async () => {
    const first = await placeOrder(buyer);
    expect(
      (await prisma.orderAttribution.findUniqueOrThrow({ where: { orderId: first.orderId } }))
        .distributorId,
    ).toBe(l2.userId);

    const second = await placeOrder(buyer, rootCode);
    const attr = await prisma.orderAttribution.findUniqueOrThrow({
      where: { orderId: second.orderId },
    });
    expect(attr.distributorId).toBe(l2.userId);

    await payOrder(buyer, second.orderNumber);
    orderId = second.orderId;
    orderNumber = second.orderNumber;
  });

  it("支付成功后按 10/5/2 逐级计提，金额精确到分", async () => {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const logs = await prisma.commissionLog.findMany({
      where: { orderId },
      orderBy: { level: "asc" },
    });
    expect(logs.map((l) => l.toUserId)).toEqual([l2.userId, l1.userId, root.userId]);
    expect(logs.map((l) => l.level)).toEqual([1, 2, 3]);
    expect(logs.map((l) => Number(l.ratio))).toEqual([10, 5, 2]);

    const base = Math.round((Number(order.subtotal) - Number(order.discount)) * 100) / 100;
    expect(Number(logs[0]!.baseAmount)).toBeCloseTo(base, 2);
    expect(Number(logs[0]!.amount)).toBeCloseTo(Math.round(base * 10) / 100, 2);
    expect(logs[0]!.status).toBe("PENDING");
    for (const l of logs) expect(Number(l.amountCny)).toBeGreaterThan(0);
    expect(logs[0]!.currency).toBe(order.currency);
  });

  it("重复支付回调不会重复计佣（幂等）", async () => {
    const before = await prisma.commissionLog.count({ where: { orderId } });
    await payOrder(buyer, orderNumber);
    const after = await prisma.commissionLog.count({ where: { orderId } });
    expect(after).toBe(before);
  });

  it("确认收货 → 佣金立即结算进可提现余额", async () => {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const { POST: shipPost } = await import("@/app/api/admin/orders/[id]/ship/route");
    const ship = await callApi(shipPost, {
      method: "POST",
      cookies: cookiesOf(adminJar),
      params: { id: orderId },
      body: { trackingCompany: "顺丰", trackingNumber: `SF${Date.now()}` },
    });
    expect(ship.status).toBe(200);

    const { POST: confirmPost } =
      await import("@/app/api/orders/[orderNumber]/confirm-delivery/route");
    const confirm = await callApi(confirmPost, {
      method: "POST",
      cookies: cookiesOf(buyer.jar),
      params: { orderNumber: order.orderNumber },
    });
    expect(confirm.status).toBe(200);

    const logs = await prisma.commissionLog.findMany({
      where: { orderId },
      orderBy: { level: "asc" },
    });
    expect(logs.every((l) => l.status === "SETTLED")).toBe(true);

    // 注意：必须按 toUserId 取「我这条」，不能靠 findMany 的返回顺序
    // （同一订单有多条佣金，未排序时取到的是哪一级并不确定 —— 第一版断言就是这么写错的）
    const myLog = logs.find((l) => l.toUserId === l2.userId)!;
    expect(myLog).toBeTruthy();
    const account = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: l2.userId },
    });
    expect(Number(account.balance)).toBeCloseTo(Number(myLog.amountCny), 2);
  });

  it("退款 → 佣金冲正，且已入账部分从余额扣回", async () => {
    const before = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: l2.userId },
    });
    const { PUT } = await import("@/app/api/admin/orders/[id]/status/route");
    const res = await callApi(PUT, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      params: { id: orderId },
      body: { status: "REFUNDED" },
    });
    expect(res.status).toBe(200);

    const logs = await prisma.commissionLog.findMany({ where: { orderId } });
    expect(logs.every((l) => l.status === "REVERSED")).toBe(true);

    const myLog = logs.find((l) => l.toUserId === l2.userId)!;
    expect(myLog.reversedAt).not.toBeNull();
    const after = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: l2.userId },
    });
    expect(Number(after.balance)).toBeCloseTo(Number(before.balance) - Number(myLog.amountCny), 2);
    expect(Number(after.balance)).toBeCloseTo(0, 2);
  });

  it("自购不给自已一级佣金，上级照常分佣", async () => {
    // l2 自己下单：归属他的上级 l1 → 链路 l1(1) → root(2)
    const order = await placeOrder(l2);
    await payOrder(l2, order.orderNumber);
    const logs = await prisma.commissionLog.findMany({
      where: { orderId: order.orderId },
      orderBy: { level: "asc" },
    });
    expect(logs.map((l) => l.toUserId)).toEqual([l1.userId, root.userId]);
    expect(logs.some((l) => l.toUserId === l2.userId)).toBe(false);
  });
});

describe("提现闭环", () => {
  it("余额不足被拒；足够时冻结并进入待审核；在途期间不可再申请", async () => {
    const { applyWithdraw } = await import("@/server/services/distribution");
    await expect(applyWithdraw({ userId: l1.userId, amount: 999_999 })).rejects.toThrow();

    await prisma.distributorAccount.upsert({
      where: { userId: l1.userId },
      create: { userId: l1.userId, balance: 500, totalCommission: 500 },
      update: { balance: 500, totalCommission: 500 },
    });

    const applied = await applyWithdraw({
      payeeName: "张三分销",
      payeeMethod: "alipay",
      userId: l1.userId,
      amount: 200,
      accountInfo: "6222021234567890123",
      remark: "测试提现",
    });
    expect(applied.amount).toBe(200);

    const account = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: l1.userId },
    });
    expect(Number(account.balance)).toBe(300);
    expect(Number(account.frozen)).toBe(200);

    await expect(applyWithdraw({ userId: l1.userId, amount: 100 })).rejects.toThrow();
  });

  it("审核通过 → 标记打款 → 冻结核销", async () => {
    const actorId = await adminId();
    const record = await prisma.withdrawRecord.findFirstOrThrow({
      where: { userId: l1.userId, status: "PENDING" },
    });
    const { auditWithdraw } = await import("@/server/services/distribution");
    await auditWithdraw({ id: record.id, action: "approve", actorId });
    await auditWithdraw({
      id: record.id,
      action: "paid",
      actorId,
      payNote: "线下转账 #20260920",
    });

    const fresh = await prisma.withdrawRecord.findUniqueOrThrow({ where: { id: record.id } });
    expect(fresh.status).toBe("PAID");
    const account = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: l1.userId },
    });
    expect(Number(account.frozen)).toBe(0);
    expect(Number(account.balance)).toBe(300);
  });

  it("驳回 → 金额解冻退回余额", async () => {
    const actorId = await adminId();
    await prisma.distributorAccount.update({
      where: { userId: root.userId },
      data: { balance: 120, frozen: 0 },
    });
    const { applyWithdraw, auditWithdraw } = await import("@/server/services/distribution");
    const applied = await applyWithdraw({
      userId: root.userId,
      amount: 120,
      payeeName: "李四提现",
      payeeMethod: "bank",
    });
    await auditWithdraw({ id: applied.id, action: "reject", actorId, note: "收款信息不完整" });

    const account = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: root.userId },
    });
    expect(Number(account.frozen)).toBe(0);
    expect(Number(account.balance)).toBe(120);
    const fresh = await prisma.withdrawRecord.findUniqueOrThrow({ where: { id: applied.id } });
    expect(fresh.status).toBe("REJECTED");
  });
});

describe("行级权限与脱敏", () => {
  it("分销商只能看到自己的客户，且昵称/邮箱/手机号均已脱敏", async () => {
    const { GET } = await import("@/app/api/distribution/my/customers/route");
    const res = await callApi(GET, {
      cookies: cookiesOf(l2.jar),
      headers: { "x-test-url": "/api/distribution/my/customers" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { name: string; email: string; phone: string }[];
      pagination: { total: number };
    };
    expect(body.pagination.total).toBeGreaterThan(0);
    for (const row of body.data) {
      expect(row.email).toContain("***");
      expect(row.phone).toMatch(/^\d{3}\*{4}\d{4}$|^\*{3}$|^$/);
      expect(row.name).toMatch(/\*\*$/);
    }
  });

  it("越权看不到不属于自己的客户", async () => {
    const { GET } = await import("@/app/api/distribution/my/customers/route");
    const res = await callApi(GET, {
      cookies: cookiesOf(l1.jar),
      headers: { "x-test-url": "/api/distribution/my/customers" },
    });
    const body = (await res.json()) as { data: { customerId: string }[] };
    expect(body.data.some((r) => r.customerId === buyer.userId)).toBe(false);
  });

  it("团队订单只下发直接客户订单，且地址只给省市", async () => {
    const { GET } = await import("@/app/api/distribution/my/orders/route");
    const res = await callApi(GET, {
      cookies: cookiesOf(l2.jar),
      headers: { "x-test-url": "/api/distribution/my/orders" },
    });
    const body = (await res.json()) as { data: { region: string }[] };
    expect(body.data.length).toBeGreaterThan(0);
    for (const row of body.data) expect(row.region).not.toContain("科技园");
  });
});

describe("对账补偿（漏记可被扫平）", () => {
  it("删掉归属与佣金后，reconcile 能补回归属与三级佣金", async () => {
    const order = await placeOrder(buyer);
    await payOrder(buyer, order.orderNumber);
    expect(await prisma.commissionLog.count({ where: { orderId: order.orderId } })).toBeGreaterThan(
      0,
    );

    // 人为制造「漏记」：删掉佣金流水与归属快照（模拟钩子失效 / 模块上线前的历史订单）
    await prisma.commissionLog.deleteMany({ where: { orderId: order.orderId } });
    await prisma.orderAttribution.deleteMany({ where: { orderId: order.orderId } });

    const { reconcileDistribution } = await import("@/server/services/distribution");
    const result = await reconcileDistribution();
    expect(result.attributed).toBeGreaterThan(0);

    const attr = await prisma.orderAttribution.findUniqueOrThrow({
      where: { orderId: order.orderId },
    });
    expect(attr.distributorId).toBe(l2.userId);
    expect(await prisma.commissionLog.count({ where: { orderId: order.orderId } })).toBe(3);
  });

  it("已退款订单若残留未冲正佣金，reconcile 会冲正", async () => {
    const order = await placeOrder(buyer);
    await payOrder(buyer, order.orderNumber);
    await prisma.order.update({ where: { id: order.orderId }, data: { status: "REFUNDED" } });

    const { reconcileDistribution } = await import("@/server/services/distribution");
    await reconcileDistribution();

    const logs = await prisma.commissionLog.findMany({ where: { orderId: order.orderId } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.status === "REVERSED")).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * P0 加固回归（大爷 2026-09-21：不允许差不多、要工程级）
 *   部分退款按比例冲正 / 注销不丢流水 / 换绑重建子树 / 历史订单不回溯归属 /
 *   手动结算 / 账户与流水一致性对账
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P0 加固：部分退款按比例冲正", () => {
  it("退一半 → 只冲一半；再跑对账不再重复冲；整单退款 → 全额冲正", async () => {
    const order = await placeOrder(buyer);
    await payOrder(buyer, order.orderNumber);

    const before = await prisma.commissionLog.findMany({
      where: { orderId: order.orderId },
      orderBy: { level: "asc" },
    });
    expect(before).toHaveLength(3);
    const mine = before.find((l) => l.toUserId === l2.userId)!;

    const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    const half = Math.round((Number(orderRow.total) / 2) * 100) / 100;

    // 部分退款：用户申请 → 管理员批准（订单仍为 PAID）
    const { POST: refundPost } = await import("@/app/api/orders/[orderNumber]/refund/route");
    const apply = await callApi(refundPost, {
      method: "POST",
      cookies: cookiesOf(buyer.jar),
      params: { orderNumber: order.orderNumber },
      body: { reason: "集成测试：部分退款按比例冲正", amount: half },
    });
    expect(apply.status).toBe(200);
    const refund = await prisma.refund.findFirstOrThrow({
      where: { orderId: order.orderId },
      orderBy: { createdAt: "desc" },
    });
    const { PUT: refundPut } = await import("@/app/api/admin/refunds/[id]/route");
    const approve = await callApi(refundPut, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      params: { id: refund.id },
      body: { decision: "approve", adminNote: "同意部分退款" },
    });
    expect(approve.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe(
      "PAID",
    );

    const afterPartial = await prisma.commissionLog.findUniqueOrThrow({ where: { id: mine.id } });
    /* 冲正分母 = **商品实付小计**（subtotal − discount），与计佣基数同源。
       这里刻意**不再**用 orderRow.total：含运费订单用 total 作分母会系统性漏冲
       （商品全退时只冲 90%，平台在已退款商品上白付佣金）——P1-1 修复。 */
    const commissionBase = Number(orderRow.subtotal) - Number(orderRow.discount);
    const expectedRatio = half / commissionBase;
    expect(Number(afterPartial.reversedAmount)).toBeCloseTo(Number(mine.amount) * expectedRatio, 1);
    // 部分冲正不等于全额：状态不能被标成 REVERSED
    expect(afterPartial.status).not.toBe("REVERSED");

    /* 幂等：再跑一次同比例的冲正（退款钩子与每分钟对账调用的都是这个函数），
       冲正额不得增长。这里刻意用**定向**调用而不是全量 reconcileDistribution()：
       全量对账会扫描测试库里累积的历史订单，属于环境噪声，会把用例拖超时。 */
    const { applyOrderReversal } = await import("@/server/services/distribution");
    await applyOrderReversal(order.orderId, expectedRatio, "幂等复验");
    const afterReplay = await prisma.commissionLog.findUniqueOrThrow({ where: { id: mine.id } });
    expect(Number(afterReplay.reversedAmount)).toBeCloseTo(Number(afterPartial.reversedAmount), 2);

    // 整单退款 → 全额冲正
    const { PUT: orderPut } = await import("@/app/api/admin/orders/[id]/status/route");
    const full = await callApi(orderPut, {
      method: "PUT",
      cookies: cookiesOf(adminJar),
      params: { id: order.orderId },
      body: { status: "REFUNDED" },
    });
    expect(full.status).toBe(200);
    const afterFull = await prisma.commissionLog.findMany({ where: { orderId: order.orderId } });
    expect(afterFull.every((l) => l.status === "REVERSED")).toBe(true);
    for (const l of afterFull) {
      expect(Number(l.reversedAmount)).toBeCloseTo(Number(l.amount), 2);
    }
  });
});

describe("P0 加固：注销不丢佣金流水", () => {
  it("删除/匿名化分销商后，他的佣金流水保留且带快照", async () => {
    // 独立搭一条链，避免影响前面的用例：victim 邀请 customer
    const victim = await registerUser("victim");
    const victimCode = await codeOf(victim.userId);
    const customer = await registerUser("victim-cust", victimCode);

    const order = await placeOrder(customer);
    await payOrder(customer, order.orderNumber);

    const log = await prisma.commissionLog.findFirstOrThrow({
      where: { orderId: order.orderId, toUserId: victim.userId },
    });
    expect(log.toUserName).toBeTruthy();
    expect(log.toUserEmail).toContain("@");

    // 管理员删除该用户（匿名化 + 停用 + 吊销会话）
    const { DELETE } = await import("@/app/api/admin/users/[id]/route");
    const del = await callApi(DELETE, {
      method: "DELETE",
      cookies: cookiesOf(adminJar),
      params: { id: victim.userId },
    });
    expect([200, 204]).toContain(del.status);

    // 后台删除是「匿名化软删」：用户行仍在（用于留痕），流水必须原样保留
    const survived = await prisma.commissionLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(survived.toUserId).toBe(victim.userId);
    expect(survived.toUserName).toBe(log.toUserName);
    expect(survived.toUserEmail).toBe(log.toUserEmail);
    expect(Number(survived.amountCny)).toBeGreaterThan(0);

    // 硬删除（GDPR 抹除 / 运维清库）：外键必须 SetNull —— 流水不能跟着被级联删掉
    const victim2 = await registerUser("victim2");
    const victim2Code = await codeOf(victim2.userId);
    const customer2 = await registerUser("victim2-cust", victim2Code);
    const order2 = await placeOrder(customer2);
    await payOrder(customer2, order2.orderNumber);
    const log2 = await prisma.commissionLog.findFirstOrThrow({
      where: { orderId: order2.orderId, toUserId: victim2.userId },
    });

    await prisma.user.delete({ where: { id: victim2.userId } });

    const afterHardDelete = await prisma.commissionLog.findUniqueOrThrow({
      where: { id: log2.id },
    });
    expect(afterHardDelete.toUserId).toBeNull(); // 外键置空
    expect(afterHardDelete.toUserName).toBe(log2.toUserName); // 快照仍在 → 账目可追溯
    expect(afterHardDelete.toUserEmail).toBe(log2.toUserEmail);
    expect(Number(afterHardDelete.amountCny)).toBeGreaterThan(0);
  });
});

describe("P0 加固：换绑重建子树闭包", () => {
  it("换绑中间层分销商后，其下级的上级链整体切换", async () => {
    const { getClosure, bindCustomer } = await import("@/server/services/distribution");
    const { saveDistributionConfig } = await import("@/server/services/distribution");

    // 链：u1 ← u2 ← u3 ← u5；其中 u2 是**中间层分销商**（有下级），u4 是新的上级。
    // 注意：闭包行只在「用户成为分销商（首次成功推广）」时建立 ——
    // 所以必须让 u3 也推广出 u5，u3 才真正进入分销树、成为 u2 的子树。
    const u1 = await registerUser("rb-u1");
    const u1Code = await codeOf(u1.userId);
    const u2 = await registerUser("rb-u2", u1Code);
    const u2Code = await codeOf(u2.userId);
    const u3 = await registerUser("rb-u3", u2Code);
    const u3Code = await codeOf(u3.userId);
    const u5 = await registerUser("rb-u5", u3Code);
    const u5Code = await codeOf(u5.userId);
    const u6 = await registerUser("rb-u6", u5Code);
    const u4 = await registerUser("rb-u4"); // 新上级

    const before = new Map((await getClosure(u3.userId)).map((c) => [c.userId, c.depth]));
    expect(before.get(u2.userId)).toBe(1);
    expect(before.get(u1.userId)).toBe(2);
    // u5 也是分销商（u6 通过他的码注册）→ 有闭包行，且已到第 3 层
    const midBefore = new Map((await getClosure(u5.userId)).map((c) => [c.userId, c.depth]));
    expect(midBefore.get(u3.userId)).toBe(1);
    expect(midBefore.get(u2.userId)).toBe(2);
    expect(midBefore.get(u1.userId)).toBe(3);

    await saveDistributionConfig({ allowRebind: true });
    try {
      // P1-8：换绑是资金关系变更 → 先受理（生成待审核申请），不自动生效
      const requested = await bindCustomer({
        customerId: u2.userId,
        code: await codeOf(u4.userId),
        source: "集成测试换绑",
      });
      expect(requested.outcome).toBe("REBIND_PENDING");

      // 申请期间归属不变
      const stillOld = await prisma.distributorCustomerBind.findUniqueOrThrow({
        where: { customerId: u2.userId },
      });
      expect(stillOld.distributorId).toBe(u1.userId);

      // 重复点击不会生成第二条待审申请
      const again = await bindCustomer({
        customerId: u2.userId,
        code: await codeOf(u4.userId),
      });
      expect(again.outcome).toBe("REBIND_PENDING");
      expect(
        await prisma.rebindRequest.count({ where: { customerId: u2.userId, status: "PENDING" } }),
      ).toBe(1);

      // 平台审核通过 → 真正落库（并重建子树闭包）
      const pending = await prisma.rebindRequest.findFirstOrThrow({
        where: { customerId: u2.userId, status: "PENDING" },
      });
      const { reviewRebindRequest } = await import("@/server/services/distribution");
      const reviewed = await reviewRebindRequest({
        requestId: pending.id,
        action: "approve",
        actorId: await adminId(),
        note: "集成测试：同意换绑",
      });
      expect(reviewed.status).toBe("APPROVED");
    } finally {
      await saveDistributionConfig({ allowRebind: false });
    }

    // u2 的上级换成 u4；**u3（下级）的链也必须整体跟着换**
    const u2Chain = new Map((await getClosure(u2.userId)).map((c) => [c.userId, c.depth]));
    expect(u2Chain.get(u4.userId)).toBe(1);
    expect(u2Chain.has(u1.userId)).toBe(false);

    const u3Chain = new Map((await getClosure(u3.userId)).map((c) => [c.userId, c.depth]));
    expect(u3Chain.get(u2.userId)).toBe(1);
    expect(u3Chain.get(u4.userId)).toBe(2);
    expect(u3Chain.has(u1.userId)).toBe(false);

    // 再深一层（u5 在 u2 子树里，距 u2 两跳）：整棵子树的祖先链都要切到新上级
    const midAfter = new Map((await getClosure(u5.userId)).map((c) => [c.userId, c.depth]));
    expect(midAfter.get(u3.userId)).toBe(1);
    expect(midAfter.get(u2.userId)).toBe(2);
    expect(midAfter.get(u4.userId)).toBe(3);
    expect(midAfter.has(u1.userId)).toBe(false);

    // 层级字段必须与闭包**同批更新**（P2 回归）：此前子节点只重建闭包表，
    // distLevel/distPath/invitedById 保持旧值 —— 「我的下级」列表按 distLevel
    // 展示层级，换绑越深错得越多（与闭包口径分叉）。
    const [u2Row, u3Row, u5Row] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: u2.userId }, select: { distLevel: true } }),
      prisma.user.findUniqueOrThrow({
        where: { id: u3.userId },
        select: { distLevel: true, distPath: true, invitedById: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: u5.userId },
        select: { distLevel: true, distPath: true, invitedById: true },
      }),
    ]);
    expect(u3Row.invitedById).toBe(u2.userId);
    expect(u3Row.distLevel).toBe(u2Row.distLevel + 1);
    expect(u5Row.invitedById).toBe(u3.userId);
    expect(u5Row.distLevel).toBe(u3Row.distLevel + 1);
    // 新路径指向新上级链，旧上级（u1）不得残留在路径里
    expect(u3Row.distPath).toContain(`/${u2.userId}/`);
    expect(u5Row.distPath).toContain(`/${u2.userId}/`);
    expect(u3Row.distPath).not.toContain(`/${u1.userId}/`);
    expect(u5Row.distPath).not.toContain(`/${u1.userId}/`);
  });
});

describe("P0 加固：历史订单不回溯归属", () => {
  it("早于模块启用时间的订单被标记为自然单，不按当前绑定补归属", async () => {
    const { reconcileDistribution, getDistributionEnabledAt } =
      await import("@/server/services/distribution");
    const order = await placeOrder(buyer);
    await payOrder(buyer, order.orderNumber);
    await prisma.orderAttribution.deleteMany({ where: { orderId: order.orderId } });

    // 把启用时间基线推到「未来」→ 该订单视为历史数据
    const enabledAt = await getDistributionEnabledAt();
    await prisma.siteSetting.upsert({
      where: { key: "distributionEnabledAt" },
      create: {
        key: "distributionEnabledAt",
        value: new Date(Date.now() + 86_400_000).toISOString(),
      },
      update: { value: new Date(Date.now() + 86_400_000).toISOString() },
    });
    try {
      const res = await reconcileDistribution();
      expect(res.archivedNatural).toBeGreaterThan(0);
      const attr = await prisma.orderAttribution.findUniqueOrThrow({
        where: { orderId: order.orderId },
      });
      expect(attr.natural).toBe(true);
      expect(attr.distributorId).toBeNull();
    } finally {
      await prisma.siteSetting.upsert({
        where: { key: "distributionEnabledAt" },
        create: { key: "distributionEnabledAt", value: enabledAt.toISOString() },
        update: { value: enabledAt.toISOString() },
      });
    }
  });
});

describe("P0 加固：手动结算（CRON 关闭时的兜底）", () => {
  it("未到持有期的订单也能通过管理端强制结算", async () => {
    const order = await placeOrder(buyer);
    await payOrder(buyer, order.orderNumber);
    expect(
      (await prisma.commissionLog.findMany({ where: { orderId: order.orderId } })).every(
        (l) => l.status === "PENDING",
      ),
    ).toBe(true);

    const { POST } = await import("@/app/api/admin/distribution/settle/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(adminJar),
      body: { orderId: order.orderId },
    });
    expect(res.status).toBe(200);
    const logs = await prisma.commissionLog.findMany({ where: { orderId: order.orderId } });
    expect(logs.every((l) => l.status === "SETTLED")).toBe(true);

    // 顾客侧无权调用
    const denied = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(buyer.jar),
      body: { orderId: order.orderId },
    });
    expect([401, 403]).toContain(denied.status);
  });
});

describe("P0 加固：账户与流水一致性对账", () => {
  it("账户被改动后能被检出，并按流水口径修复", async () => {
    const { verifyAccountConsistency } = await import("@/server/services/distribution");

    const account = await prisma.distributorAccount.findFirstOrThrow({
      where: { balance: { gt: 0 } },
    });

    // 人为制造偏差（模拟历史脏写）
    await prisma.distributorAccount.update({
      where: { userId: account.userId },
      data: { balance: { increment: 1000 } },
    });

    const detected = await verifyAccountConsistency();
    const row = detected.drifted.find((d) => d.userId === account.userId);
    expect(row).toBeTruthy();

    const repaired = await verifyAccountConsistency({ apply: true });
    expect(repaired.repaired).toBeGreaterThan(0);

    // 修复口径 = 流水推导值（不是"改回被注入前的数字"——那个数字本身就不来自流水）
    const fixed = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: account.userId },
    });
    expect(Number(fixed.balance)).toBeCloseTo(row!.expected.balance, 2);
    expect(Number(fixed.totalCommission)).toBeCloseTo(row!.expected.totalCommission, 2);

    // 修复后再校验应当零偏差（幂等）
    const clean = await verifyAccountConsistency();
    expect(clean.drifted).toEqual([]);
  });
});

describe("P1-10 提现 KYC 与规则确认", () => {
  it("首次提现必须实名 + 收款方式，并留下规则确认时间", async () => {
    const fresh = await registerUser("kyc-fresh");
    const { applyWithdraw } = await import("@/server/services/distribution");

    await prisma.distributorAccount.upsert({
      where: { userId: fresh.userId },
      create: { userId: fresh.userId, balance: 200, totalCommission: 200 },
      update: { balance: 200, totalCommission: 200 },
    });

    // 缺实名 → 拒绝（服务端强校验，不依赖前端）
    await expect(applyWithdraw({ userId: fresh.userId, amount: 100 })).rejects.toThrow(
      /收款人实名/,
    );

    const applied = await applyWithdraw({
      userId: fresh.userId,
      amount: 100,
      payeeName: "王五实名",
      payeeMethod: "bank",
      accountInfo: "6222021234567890123",
    });
    expect(applied.amount).toBe(100);

    // 规则确认留痕
    const account = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: fresh.userId },
    });
    expect(account.termsAcceptedAt).toBeTruthy();

    // KYC 落到提现单上（线下打款凭证口径）
    const record = await prisma.withdrawRecord.findFirstOrThrow({
      where: { userId: fresh.userId, status: "PENDING" },
    });
    expect(record.payeeName).toBe("王五实名");
    expect(record.payeeMethod).toBe("bank");
    expect(record.userEmail).toContain("@");

    // 账户摘要对外暴露确认状态（前端据此决定是否显示勾选框）
    const { getAccountSummary } = await import("@/server/services/distribution");
    const summary = await getAccountSummary(fresh.userId);
    expect(summary.termsAccepted).toBe(true);
    expect(summary.termsAcceptedAt).toBeTruthy();
  });

  it("已有 KYC 记录时，二次提现可省略实名并沿用上一次的值", async () => {
    const reuse = await registerUser("kyc-reuse");
    const { applyWithdraw, auditWithdraw } = await import("@/server/services/distribution");

    await prisma.distributorAccount.upsert({
      where: { userId: reuse.userId },
      create: { userId: reuse.userId, balance: 400, totalCommission: 400 },
      update: { balance: 400, totalCommission: 400 },
    });

    await applyWithdraw({
      userId: reuse.userId,
      amount: 100,
      payeeName: "赵六实名",
      payeeMethod: "alipay",
    });
    // 结掉在途，才能再申请
    const first = await prisma.withdrawRecord.findFirstOrThrow({
      where: { userId: reuse.userId, status: "PENDING" },
    });
    await auditWithdraw({
      id: first.id,
      action: "reject",
      actorId: await adminId(),
      note: "集成测试：清掉在途",
    });

    await applyWithdraw({ userId: reuse.userId, amount: 100 });
    const second = await prisma.withdrawRecord.findFirstOrThrow({
      where: { userId: reuse.userId, status: "PENDING" },
    });
    expect(second.payeeName).toBe("赵六实名");
    expect(second.payeeMethod).toBe("alipay");
  });
});

describe("P1-8 人工冲正与风控", () => {
  it("人工冲正已结算佣金：扣回余额、置为已冲正、重复操作被拒", async () => {
    const buyer2 = await registerUser("manual-rev-buyer", await codeOf(l2.userId));
    const order = await placeOrder(buyer2);
    await payOrder(buyer2, order.orderNumber);

    const { settleOrder, reverseCommissionManually } =
      await import("@/server/services/distribution");
    await settleOrder(order.orderId);

    const log = await prisma.commissionLog.findFirstOrThrow({
      where: { orderId: order.orderId, toUserId: l2.userId },
    });
    expect(log.status).toBe("SETTLED");
    const before = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: l2.userId },
    });

    const actorId = await adminId();
    const res = await reverseCommissionManually({
      logId: log.id,
      amount: null, // 全额
      note: "集成测试：刷单认定",
      actorId,
    });
    expect(res.fullReversed).toBe(true);

    const after = await prisma.commissionLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(after.status).toBe("REVERSED");
    expect(Number(after.reversedAmount)).toBeCloseTo(Number(after.amount), 2);

    const account = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: l2.userId },
    });
    // 已入账部分按增量扣回
    expect(Number(account.balance)).toBeCloseTo(Number(before.balance) - Number(log.amountCny), 2);

    // 幂等/防重复：已全额冲正后再冲直接拒绝
    await expect(
      reverseCommissionManually({ logId: log.id, note: "重复冲正", actorId }),
    ).rejects.toThrow();
  });

  it("风控视图能检出负余额账户与超层级规则", async () => {
    const { getRiskReport } = await import("@/server/services/distribution");
    const report = await getRiskReport();
    expect(Array.isArray(report.findings)).toBe(true);
    // 上面的用例把余额扣成负数或正值都合法；这里只要求接口可用且计数自洽
    for (const f of report.findings) {
      expect(report.counts[f.kind]).toBeGreaterThan(0);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * P2-14 并发正确性与大团队性能（"钱不会被算两遍"的硬证据）
 * ══════════════════════════════════════════════════════════════════════════ */

describe("P2-14 并发：结算与冲正都不会重复记账", () => {
  it("同一订单被并发结算 5 次，每位受益人也只入账一次", async () => {
    const buyer3 = await registerUser("conc-settle-buyer", await codeOf(l2.userId));
    const order = await placeOrder(buyer3);
    await payOrder(buyer3, order.orderNumber);

    const users = [l2.userId, l1.userId, root.userId];
    const beforeRows = await prisma.distributorAccount.findMany({
      where: { userId: { in: users } },
    });
    const before = new Map(beforeRows.map((a) => [a.userId, Number(a.balance)]));

    const { settleOrder } = await import("@/server/services/distribution");
    await Promise.all(Array.from({ length: 5 }, () => settleOrder(order.orderId)));

    const logs = await prisma.commissionLog.findMany({ where: { orderId: order.orderId } });
    expect(logs).toHaveLength(3);
    expect(logs.every((x) => x.status === "SETTLED")).toBe(true);

    const afterRows = await prisma.distributorAccount.findMany({
      where: { userId: { in: users } },
    });
    for (const log of logs) {
      if (!log.toUserId) continue;
      const delta =
        Number(afterRows.find((a) => a.userId === log.toUserId)?.balance ?? 0) -
        (before.get(log.toUserId) ?? 0);
      // 每个受益人只应收到「该流水净额」一次，而不是 5 倍
      expect(delta).toBeCloseTo(Number(log.amountCny) - Number(log.reversedCny), 2);
    }
  });

  it("同一订单被并发按 50% 冲正 5 次，累计只冲一半（CAS 生效）", async () => {
    const buyer4 = await registerUser("conc-rev-buyer", await codeOf(l2.userId));
    const order = await placeOrder(buyer4);
    await payOrder(buyer4, order.orderNumber);

    const { settleOrder, applyOrderReversal } = await import("@/server/services/distribution");
    await settleOrder(order.orderId);

    const log = await prisma.commissionLog.findFirstOrThrow({
      where: { orderId: order.orderId, toUserId: l2.userId },
    });
    const before = await prisma.distributorAccount.findUniqueOrThrow({
      where: { userId: l2.userId },
    });

    await Promise.all(
      Array.from({ length: 5 }, () => applyOrderReversal(order.orderId, 0.5, "并发冲正测试")),
    );

    const after = await prisma.commissionLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(Number(after.reversedAmount)).toBeCloseTo(Number(log.amount) * 0.5, 2);
    expect(after.status).not.toBe("REVERSED");

    const acc = await prisma.distributorAccount.findUniqueOrThrow({ where: { userId: l2.userId } });
    // 只扣一次一半，而不是被扣成负数（按「分」容差，避免四舍五入刚好卡在边界）
    expect(
      Math.abs(Number(before.balance) - Number(acc.balance) - Number(log.amountCny) * 0.5),
    ).toBeLessThanOrEqual(0.01);
  });
});

describe("P2-14 大团队：闭包链与团队统计在规模下仍可用", () => {
  it("1000 人团队的闭包查询/团队统计/佣金链解析都在时间上界内", async () => {
    const perfRoot = await registerUser("perf-root");
    const passwordHash = "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789012345678901234"; // 仅占位，不用于登录

    // 直接写库造 1000 个后代（绕过注册限流）：300 个一级、700 个二级
    const firstLevel = await prisma.user.createManyAndReturn({
      data: Array.from({ length: 300 }, (_, i) => ({
        email: `perf-l1-${i}-${perfRoot.userId}@example.com`,
        name: `Perf L1 ${i}`,
        passwordHash,
      })),
      select: { id: true },
    });
    const secondLevel = await prisma.user.createManyAndReturn({
      data: Array.from({ length: 700 }, (_, i) => ({
        email: `perf-l2-${i}-${perfRoot.userId}@example.com`,
        name: `Perf L2 ${i}`,
        passwordHash,
        invitedById: firstLevel[i % firstLevel.length]!.id,
      })),
      select: { id: true },
    });

    // 闭包：root → 1000 人（一级 depth=1，二级 depth=2）
    await prisma.distributionRelation.createMany({
      data: [
        { ancestorId: perfRoot.userId, descendantId: perfRoot.userId, depth: 0 },
        ...firstLevel.map((u) => ({
          ancestorId: perfRoot.userId,
          descendantId: u.id,
          depth: 1,
        })),
        ...secondLevel.map((u) => ({
          ancestorId: perfRoot.userId,
          descendantId: u.id,
          depth: 2,
        })),
        ...secondLevel.map((u, i) => ({
          ancestorId: firstLevel[i % firstLevel.length]!.id,
          descendantId: u.id,
          depth: 1,
        })),
      ],
      skipDuplicates: true,
    });

    const { getDescendantIds, getTeamStats, getCommissionChain } =
      await import("@/server/services/distribution");

    const t0 = Date.now();
    const descendants = await getDescendantIds(perfRoot.userId);
    const t1 = Date.now();
    expect(descendants.length).toBeGreaterThanOrEqual(1000);

    const stats = await getTeamStats(perfRoot.userId, 30);
    const t2 = Date.now();
    expect(Array.isArray(stats.series)).toBe(true);

    // 二级子节点向上解析佣金链（深度 2）
    const chain = await getCommissionChain(secondLevel[0]!.id);
    const t3 = Date.now();
    expect(chain.length).toBeGreaterThanOrEqual(2);

    // 时间上界：单次要远小于 3 秒（慢盘 + 并发负载下的宽松上界）
    expect(t1 - t0).toBeLessThan(3000);
    expect(t2 - t1).toBeLessThan(3000);
    expect(t3 - t2).toBeLessThan(1000);
  });
});

describe("P2-15 分销商等级在真实计佣链路生效", () => {
  it("同层级不同等级命中不同比例；等级只影响之后的订单", async () => {
    // 造一条链：tierRoot ← tierMid ← tierLeaf ← buyer
    const tierRoot = await registerUser("tier-root");
    const tierRootCode = await codeOf(tierRoot.userId);
    const tierMid = await registerUser("tier-mid", tierRootCode);
    const midCode = await codeOf(tierMid.userId);
    const tierLeaf = await registerUser("tier-leaf", midCode);
    const leafCode = await codeOf(tierLeaf.userId);
    const tierBuyer = await registerUser("tier-buyer", leafCode);

    // 给中间层开通 VIP(2) 专用比例：二级 20%（通用二级是 5%）
    const { setDistributorTier } = await import("@/server/services/distribution");
    await setDistributorTier({ userId: tierMid.userId, tier: 2, actorId: await adminId() });
    await prisma.commissionRule.upsert({
      // 唯一键含 tierLevel（0=通用，2=VIP2 专用）：等级规则与通用规则**并存**，
      // 不再互相覆盖（P0-1）。这里 upsert 的是「VIP 2 级专用」那一行。
      where: {
        scopeType_scopeId_level_tierLevel: {
          scopeType: "GLOBAL",
          scopeId: "",
          level: 2,
          tierLevel: 2,
        },
      },
      create: {
        scopeType: "GLOBAL",
        scopeId: "",
        level: 2,
        mode: "RATIO",
        ratio: 20,
        tierLevel: 2,
        enabled: true,
      },
      update: { mode: "RATIO", ratio: 20, enabled: true },
    });
    // 规则被直接改过库 → 清缓存（生产走后台接口会自动失效）
    const { invalidateDistributionCache } = await import("@/server/services/distribution");
    await invalidateDistributionCache();

    try {
      const order = await placeOrder(tierBuyer);
      await payOrder(tierBuyer, order.orderNumber);

      const logs = await prisma.commissionLog.findMany({
        where: { orderId: order.orderId },
        orderBy: { level: "asc" },
      });
      const byLevel = new Map(logs.map((l) => [l.level, l]));
      // 一级 = 归属人（普通等级）→ 通用 10%
      expect(Number(byLevel.get(1)!.ratio)).toBeCloseTo(10, 2);
      // 二级 = VIP(2) → 命中 20% 专用规则
      expect(Number(byLevel.get(2)!.ratio)).toBeCloseTo(20, 2);
      expect(byLevel.get(2)!.toUserId).toBe(tierMid.userId);
      /* 三级本应是通用 2%，但 10% + 20% 已经顶到「总比例上限 30%」，
         因此第三级被**整体跳过**（这正是上限闸门该有的行为：宁可少返，不可返穿毛利） */
      expect(byLevel.get(3)).toBeUndefined();
      const totalRatio = logs.reduce((sum, l) => sum + Number(l.ratio), 0);
      expect(totalRatio).toBeLessThanOrEqual(30);
    } finally {
      // 复原全局规则并删除本次造的 VIP 专用行（tierLevel=2），避免影响其它用例。
      // 注意：通用规则现在是 tierLevel=0，不再是 null（P0-1 的非空哨兵口径）。
      await prisma.commissionRule.updateMany({
        where: { scopeType: "GLOBAL", scopeId: "", level: 2, tierLevel: 0 },
        data: { mode: "RATIO", ratio: 5 },
      });
      await prisma.commissionRule.deleteMany({
        where: { scopeType: "GLOBAL", scopeId: "", level: 2, tierLevel: 2 },
      });
      await invalidateDistributionCache();
    }
  });
});

describe("P2-12 团队业绩预聚合", () => {
  it("汇总作业写入日行，团队统计优先读汇总、缺失时回落实时", async () => {
    const rollupRoot = await registerUser("rollup-root");
    const rollupCode = await codeOf(rollupRoot.userId);
    const rollupBuyer = await registerUser("rollup-buyer", rollupCode);
    const order = await placeOrder(rollupBuyer);
    await payOrder(rollupBuyer, order.orderNumber);

    const { rollupDistributionDailyStats, getTeamStats } =
      await import("@/server/services/distribution");

    // 尚未汇总 → 回落实时口径，页面永远有数
    const live = await getTeamStats(rollupRoot.userId, 30);
    expect(live.source).toBe("live");

    const rolled = await rollupDistributionDailyStats({ days: 1 });
    expect(rolled.rows).toBeGreaterThan(0);

    const row = await prisma.distributionDailyStat.findFirstOrThrow({
      where: { userId: rollupRoot.userId },
    });
    expect(row.orders).toBeGreaterThanOrEqual(1);
    expect(Number(row.salesCny)).toBeGreaterThan(0);
    // 该订单产生了归属人（一级）佣金
    expect(Number(row.commissionCny)).toBeGreaterThan(0);

    // 覆盖度守卫（P1 回归）：仅汇总 1 天时查 30 天窗口 —— 覆盖不足必须回落
    // 实时口径。原断言期望 "rollup"，等于把「30 天只统计 1 天」的静默错误
    // 固化成了测试期望。
    const stats = await getTeamStats(rollupRoot.userId, 30);
    expect(stats.source).toBe("live");

    // 覆盖完整（窗口首日已被汇总覆盖）时才走预聚合
    const covered = await getTeamStats(rollupRoot.userId, 1);
    expect(covered.source).toBe("rollup");
    expect(covered.totalOrders).toBeGreaterThanOrEqual(1);
    expect(stats.totalOrders).toBeGreaterThanOrEqual(1);
    expect(stats.totalSalesCny).toBeGreaterThan(0);
    expect(stats.series.some((s) => s.orders > 0)).toBe(true);

    // 幂等：重跑不会翻倍
    await rollupDistributionDailyStats({ days: 1 });
    const again = await prisma.distributionDailyStat.findFirstOrThrow({
      where: { userId: rollupRoot.userId },
    });
    expect(again.orders).toBe(row.orders);
    expect(Number(again.salesCny)).toBeCloseTo(Number(row.salesCny), 2);
  });
});
