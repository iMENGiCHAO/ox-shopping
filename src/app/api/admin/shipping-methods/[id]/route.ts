import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { routeParam } from "@/app/api/_lib/params";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  nameEn: z.string().trim().max(64).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  descriptionEn: z.string().trim().max(500).optional().nullable(),
  fee: z.coerce.number().min(0).optional(),
  freeOver: z.coerce.number().min(0).optional(),
  isCashOnDelivery: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  etaZh: z.string().trim().max(64).optional().nullable(),
  etaEn: z.string().trim().max(64).optional().nullable(),
});

/** PUT /api/admin/shipping-methods/[id] */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, updateSchema);
  // 商用审计补痕（2026-09-26）：运费直接影响订单应付金额——更新前取旧值，
  // 留痕记前后对比。此前 PUT/DELETE 是全后台唯一「资金相关且零留痕」的写面。
  const before = await prisma.shippingMethod.findUnique({ where: { id } });
  const method = await prisma.shippingMethod.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
      ...(input.fee !== undefined ? { fee: input.fee } : {}),
      ...(input.freeOver !== undefined ? { freeOver: input.freeOver } : {}),
      ...(input.isCashOnDelivery !== undefined ? { isCashOnDelivery: input.isCashOnDelivery } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.etaZh !== undefined ? { etaZh: input.etaZh } : {}),
      ...(input.etaEn !== undefined ? { etaEn: input.etaEn } : {}),
    },
  });
  await audit({
    userId: actor.id,
    action: "ADMIN_SHIPPING_UPDATE",
    entity: "ShippingMethod",
    entityId: method.id,
    meta: {
      code: method.code,
      feeBefore: before ? before.fee : null,
      feeAfter: method.fee,
      freeOverBefore: before ? before.freeOver : null,
      freeOverAfter: method.freeOver,
      isCashOnDelivery: method.isCashOnDelivery,
      isActive: method.isActive,
    },
    req,
  });
  return json({ method });
});

/** DELETE /api/admin/shipping-methods/[id] — 仅未被订单引用的可删 */
export const DELETE = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const used = await prisma.order.count({ where: { shippingMethodId: id } });
  if (used > 0) {
    // 软删：禁用而非删除（保历史订单关联）
    const method = await prisma.shippingMethod.update({
      where: { id },
      data: { isActive: false },
    });
    await audit({
      userId: actor.id,
      action: "ADMIN_SHIPPING_DELETE",
      entity: "ShippingMethod",
      entityId: id,
      meta: { code: method.code, soft: true, orderRefs: used },
      req,
    });
    return json({ method, soft: true });
  }
  const doomed = await prisma.shippingMethod.findUnique({ where: { id } });
  await prisma.shippingMethod.delete({ where: { id } });
  await audit({
    userId: actor.id,
    action: "ADMIN_SHIPPING_DELETE",
    entity: "ShippingMethod",
    entityId: id,
    meta: { code: doomed?.code ?? null, soft: false, orderRefs: 0 },
    req,
  });
  return json({ ok: true });
});
