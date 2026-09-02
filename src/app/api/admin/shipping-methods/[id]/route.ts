import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { routeParam } from "@/app/api/_lib/params";
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
  await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, updateSchema);
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
  return json({ method });
});

/** DELETE /api/admin/shipping-methods/[id] — 仅未被订单引用的可删 */
export const DELETE = apiHandler(async (req, ctx) => {
  await requireStaff();
  const id = routeParam(ctx.params.id);
  const used = await prisma.order.count({ where: { shippingMethodId: id } });
  if (used > 0) {
    // 软删：禁用而非删除（保历史订单关联）
    const method = await prisma.shippingMethod.update({
      where: { id },
      data: { isActive: false },
    });
    return json({ method, soft: true });
  }
  await prisma.shippingMethod.delete({ where: { id } });
  return json({ ok: true });
});
