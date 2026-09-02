import { apiHandler, json, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { listAllShippingMethods, listActiveShippingMethods } from "@/server/services/shipping.service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

/** GET /api/admin/shipping-methods — 列出所有方式（含禁用） */
export const GET = apiHandler(async () => {
  await requireStaff();
  const methods = await listAllShippingMethods();
  return json({ methods });
});

const createSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(64),
  nameEn: z.string().trim().max(64).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  descriptionEn: z.string().trim().max(500).optional().nullable(),
  fee: z.coerce.number().min(0).default(0),
  freeOver: z.coerce.number().min(0).default(0),
  isCashOnDelivery: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  etaZh: z.string().trim().max(64).optional().nullable(),
  etaEn: z.string().trim().max(64).optional().nullable(),
});

/** POST /api/admin/shipping-methods — 新建 */
export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  const input = await readJson(req, createSchema);
  const method = await prisma.shippingMethod.create({
    data: {
      code: input.code.toLowerCase().replace(/\s+/g, "-"),
      name: input.name,
      nameEn: input.nameEn ?? null,
      description: input.description ?? null,
      descriptionEn: input.descriptionEn ?? null,
      fee: input.fee,
      freeOver: input.freeOver,
      isCashOnDelivery: input.isCashOnDelivery,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      etaZh: input.etaZh ?? null,
      etaEn: input.etaEn ?? null,
    },
  });
  return json({ method }, { status: 201 });
});
