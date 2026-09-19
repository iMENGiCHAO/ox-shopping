import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/session";
import { serializeOrder } from "@/server/serializers";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { adminUserUpdateSchema } from "@/lib/validations/admin";
import { revokeAllUserTokens } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { sendMail } from "@/lib/mail";

export const runtime = "nodejs";

/** GET /api/admin/users/[id] — 用户详情 + 最近订单 + 到货提醒（数据打通，消除信息孤岛） */
export const GET = apiHandler(async (req, ctx) => {
  await requireAdmin();
  const id = routeParam(ctx.params.id);

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerified: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      deletionRequestedAt: true,
      _count: { select: { orders: true, addresses: true, refunds: true } },
    },
  });
  if (!user) throw notFound("用户不存在");

  // 并行查询：订单、到货提醒（数据打通，admin 可全面了解用户行为）
  const [orders, notifyMeList, notifyMeCount] = await Promise.all([
    prisma.order.findMany({
      where: { userId: id },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // 用户的到货提醒订阅（联出商品名/图片，admin 可看到哪些商品用户在等补货）
    prisma.notifyMe.findMany({
      where: { email: user.email },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    // 到货提醒总数（NotifyMe 通过 email 关联，非 userId，单独计数）
    prisma.notifyMe.count({ where: { email: user.email } }),
  ]);

  // 到货提醒联表补商品信息（NotifyMe 与 Product 无外键，手动联表）
  const notifyProductIds = [
    ...new Set(notifyMeList.map((r) => r.productId).filter((v): v is string => !!v)),
  ];
  const notifyProducts = await prisma.product.findMany({
    where: { id: { in: notifyProductIds } },
    select: {
      id: true,
      name: true,
      nameEn: true,
      slug: true,
      images: true,
      price: true,
      stock: true,
    },
  });
  const notifyProductMap = new Map(notifyProducts.map((p) => [p.id, p]));

  // 消费汇总：与列表/仪表盘完全同口径——多币种按各订单汇率快照折算 CNY
  const [paidAggOrders, rateSnap] = await Promise.all([
    prisma.order.findMany({
      where: { userId: id, paidAt: { not: null }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
      select: { total: true, currency: true, exchangeRate: true },
    }),
    import("@/components/shop/currency-server").then((m) => m.getRateSnapshot()),
  ]);
  const usdCny = rateSnap.rates["CNY"] ?? 7.2;
  let paidCny = 0;
  for (const o of paidAggOrders) {
    const rate = Number(o.exchangeRate ?? 1);
    const usd =
      o.currency === "USD" || !rate || rate <= 0 ? Number(o.total) : Number(o.total) / rate;
    paidCny += usd * usdCny;
  }
  const paidCnyRounded = Math.round(paidCny * 100) / 100;
  const paidOrderCount = paidAggOrders.length;

  return json({
    user,
    orders: orders.map(serializeOrder),
    notifyMe: notifyMeList.map((r) => ({
      ...r,
      product: r.productId ? (notifyProductMap.get(r.productId) ?? null) : null,
    })),
    // 到货提醒总数（通过 email 关联，补充到 user._count 之外）
    notifyMeCount,
    // 消费汇总（详情面板与列表列同口径）
    paidOrderCount,
    paidCny: paidCnyRounded,
  });
});

/** PUT /api/admin/users/[id] — 编辑用户(昵称/邮箱/角色/状态) */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, adminUserUpdateSchema);

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFound("用户不存在");

  // 邮箱唯一性校验
  if (input.email && input.email !== target.email) {
    const dup = await prisma.user.findUnique({ where: { email: input.email } });
    if (dup) throw badRequest("This email is already used by another account");
  }

  // 不能把自己的角色降级(避免失去管理权限)；也不能禁用自己
  if (id === actor.id) {
    if (input.role && input.role !== "ADMIN" && target.role === "ADMIN") {
      throw badRequest("不能取消自己的管理员角色");
    }
    if (input.status === "DISABLED") throw badRequest("不能禁用自己的账号");
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerified: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  // 禁用用户时吊销其全部会话
  if (input.status === "DISABLED") await revokeAllUserTokens(id);

  await audit({
    userId: actor.id,
    action: "ADMIN_USER_UPDATE",
    entity: "User",
    entityId: id,
    meta: { changes: input },
    req,
  });

  return json({ user: updated });
});

/**
 * DELETE /api/admin/users/[id] — 后台删除用户（大爷 2026-09-20 要求）。
 *
 * 与「注销申请 → 确认注销」**同语义**的匿名化删除（不物理删行，保住订单/财务外键）：
 *   - 匿名化前先给原邮箱发 account-deleted 通知（邮箱一旦替换就发不出去）
 *   - email → deleted-{id}@invalid.local、name → 已注销用户、status=DISABLED、
 *     emailVerified=false、清空注销申请时间
 *   - 全端会话即时吊销（revokeAllUserTokens）
 *
 * 护栏：
 *   - 不能删除自己（管理权限自我保护）
 *   - 不能删除**最后一个可用管理员**（否则后台永久锁死）
 *   - 已注销账号幂等拒绝（避免重复发信/重复审计）
 */
export const DELETE = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);

  if (id === actor.id) throw badRequest("不能删除自己的账号");

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  if (!target) throw notFound("用户不存在");

  if (target.email.endsWith("@invalid.local")) {
    throw badRequest("该账号已注销，无需重复删除");
  }

  // 最后一个可用管理员保护：删掉就再也没人能进后台
  if (target.role === "ADMIN") {
    const activeAdmins = await prisma.user.count({
      where: { role: "ADMIN", status: "ACTIVE", NOT: { id } },
    });
    if (activeAdmins === 0) throw badRequest("不能删除最后一个管理员账号");
  }

  await sendMail({
    to: target.email,
    template: "account-deleted",
    data: { name: target.name },
  }).catch(() => undefined);

  await prisma.user.update({
    where: { id },
    data: {
      email: `deleted-${id}@invalid.local`,
      name: "已注销用户",
      status: "DISABLED",
      emailVerified: false,
      deletionRequestedAt: null,
    },
  });
  await revokeAllUserTokens(id);

  await audit({
    userId: actor.id,
    action: "ADMIN_USER_DELETE",
    entity: "User",
    entityId: id,
    meta: { email: target.email, name: target.name, role: target.role },
    req,
  });

  return json({ ok: true });
});
