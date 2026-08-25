import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { couponUpdateSchema } from "@/lib/validations/cart-order";
import { routeParam } from "@/app/api/_lib/params";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** PUT /api/admin/coupons/[id] */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);

  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw notFound("Discount券不存在");
  const input = await readJson(req, couponUpdateSchema);

  const data: Prisma.CouponUpdateInput = {};
  if (input.code !== undefined) {
    const code = input.code.toUpperCase();
    const dup = await prisma.coupon.findFirst({ where: { code, id: { not: id } } });
    if (dup) throw conflict("Discount码已存在");
    data.code = code;
  }
  if (input.type !== undefined) data.type = input.type;
  if (input.value !== undefined) data.value = input.value;
  if (input.minSpend !== undefined) data.minSpend = input.minSpend;
  if (input.maxDiscount !== undefined) data.maxDiscount = input.maxDiscount;
  if (input.usageLimit !== undefined) data.usageLimit = input.usageLimit;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const startsAt = input.startsAt ? new Date(input.startsAt) : undefined;
  const endsAt = input.endsAt ? new Date(input.endsAt) : undefined;
  if (
    (startsAt && Number.isNaN(startsAt.getTime())) ||
    (endsAt && Number.isNaN(endsAt.getTime()))
  ) {
    throw badRequest("日期格式不正确");
  }
  if (startsAt && endsAt && endsAt <= startsAt) throw badRequest("结束时间必须晚于开始时间");
  if (startsAt) data.startsAt = startsAt;
  if (endsAt) data.endsAt = endsAt;

  const coupon = await prisma.coupon.update({ where: { id }, data });

  await audit({
    userId: actor.id,
    action: "ADMIN_COUPON_UPDATE",
    entity: "Coupon",
    entityId: id,
    req,
  });
  return json({ coupon });
});

/** DELETE /api/admin/coupons/[id] */
export const DELETE = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);

  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw notFound("Discount券不存在");

  await prisma.coupon.delete({ where: { id } });

  await audit({
    userId: actor.id,
    action: "ADMIN_COUPON_DELETE",
    entity: "Coupon",
    entityId: id,
    req,
  });
  return json({ ok: true });
});
