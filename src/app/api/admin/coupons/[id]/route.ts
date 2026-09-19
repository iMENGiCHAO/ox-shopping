import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { serializeCoupon } from "@/server/serializers";
import { couponSchema, couponToggleSchema, type CouponInput } from "@/lib/validations/coupon";
import { badRequest, notFound } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * 与 POST /api/admin/coupons 同一套字段映射（免邮券 value 归零、封顶仅百分比券有效）。
 * 抽成同构函数是刻意的：两处各写一遍必然漂移。
 */
function couponDataFromInput(input: CouponInput) {
  return {
    code: input.code,
    type: input.type,
    value: input.type === "FREE_SHIPPING" ? 0 : (input.value ?? 0),
    minSpend: input.minSpend ?? 0,
    maxDiscount: input.type === "PERCENTAGE" ? (input.maxDiscount ?? null) : null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    usageLimit: input.usageLimit ?? 0,
    perUserLimit: input.perUserLimit ?? 1,
    isPublic: input.isPublic ?? false,
    title: input.title ?? null,
    titleEn: input.titleEn ?? null,
    description: input.description ?? null,
    descriptionEn: input.descriptionEn ?? null,
    isActive: input.isActive ?? true,
  };
}

/** 动态段参数：Next 的 ctx.params 类型是 Record<string, string | string[]> */
function couponId(ctx: { params: Record<string, string | string[]> }): string {
  const raw = ctx.params.id;
  return Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
}

/** GET /api/admin/coupons/[id] — 单个券码详情（含核销明细，便于对账） */
export const GET = apiHandler(async (_req, ctx) => {
  await requireStaff();
  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId(ctx) },
    include: {
      _count: { select: { redemptions: true } },
      redemptions: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { order: { select: { orderNumber: true, status: true, contactEmail: true } } },
      },
    },
  });
  if (!coupon) throw notFound("Coupon not found");
  return json({ coupon: serializeCoupon(coupon) });
});

/** PUT /api/admin/coupons/[id] — 全量更新券码 */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = couponId(ctx);
  const input = await readJson(req, couponSchema);

  const current = await prisma.coupon.findUnique({ where: { id } });
  if (!current) throw notFound("Coupon not found");

  // 券码唯一性：排除自身后再查重（改大小写/前后空格不应误报冲突）
  if (input.code !== current.code) {
    const dup = await prisma.coupon.findUnique({ where: { code: input.code } });
    if (dup) throw badRequest("This coupon code already exists");
  }

  // 总量上限不得低于已核销数：否则会出现「已用 10 次但上限 5」的自相矛盾状态，
  // 让运营无法判断该券到底还能不能用。要停用请直接关 isActive。
  const usageLimit = input.usageLimit ?? 0;
  if (usageLimit > 0 && usageLimit < current.usedCount) {
    throw badRequest("Usage limit cannot be lower than the redeemed count");
  }

  const coupon = await prisma.coupon.update({
    where: { id },
    data: couponDataFromInput(input),
  });

  await audit({
    userId: actor.id,
    action: "ADMIN_COUPON_UPDATE",
    entity: "Coupon",
    entityId: coupon.id,
    meta: { code: coupon.code, type: coupon.type, isActive: coupon.isActive },
    req,
  });

  return json({ coupon: serializeCoupon(coupon) });
});

/**
 * PATCH /api/admin/coupons/[id] — 局部更新（当前仅用于列表里的「启用」开关）。
 *
 * 与 PUT 的分工：PUT 是表单的整行提交，PATCH 是轻量的单字段翻转。
 * 若开关也走 PUT，前端必须回传整行，任何字段漂移都会让开关失效。
 */
export const PATCH = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = couponId(ctx);
  const input = await readJson(req, couponToggleSchema);

  const current = await prisma.coupon.findUnique({ where: { id } });
  if (!current) throw notFound("Coupon not found");

  const coupon = await prisma.coupon.update({
    where: { id },
    data: { isActive: input.isActive },
  });

  await audit({
    userId: actor.id,
    action: "ADMIN_COUPON_UPDATE",
    entity: "Coupon",
    entityId: coupon.id,
    meta: { code: coupon.code, isActive: coupon.isActive, partial: true },
    req,
  });

  return json({ coupon: serializeCoupon(coupon) });
});

/**
 * DELETE /api/admin/coupons/[id] — 删除券码。
 *
 * 已有核销记录的券**不允许物理删除**：coupon_redemptions 是「谁在什么订单上用了券」
 * 的唯一凭证，级联删除会让历史订单的优惠来源无从追溯（对账、客诉复盘都会断链）。
 * 这类券只能停用（isActive=false）。
 */
export const DELETE = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = couponId(ctx);

  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: { _count: { select: { redemptions: true } } },
  });
  if (!coupon) throw notFound("Coupon not found");

  if (coupon._count.redemptions > 0) {
    throw badRequest("Coupons with redemptions cannot be deleted");
  }

  await prisma.coupon.delete({ where: { id } });

  await audit({
    userId: actor.id,
    action: "ADMIN_COUPON_DELETE",
    entity: "Coupon",
    entityId: id,
    meta: { code: coupon.code },
    req,
  });

  return json({ ok: true });
});
