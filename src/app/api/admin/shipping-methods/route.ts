import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { listAllShippingMethods } from "@/server/services/shipping.service";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const runtime = "nodejs";

/** 代号规范：小写字母/数字/短横线（如 sf-express） */
const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** GET /api/admin/shipping-methods — 列出所有方式（含禁用，附订单引用数） */
export const GET = apiHandler(async () => {
  await requireStaff();
  const methods = await listAllShippingMethods();
  return json({ methods });
});

const createSchema = z.object({
  code: z.string().trim().min(1, "代号不能为空").max(64),
  name: z.string().trim().min(1, "名称不能为空").max(64),
  nameEn: z.string().trim().max(64).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  descriptionEn: z.string().trim().max(500).optional().nullable(),
  fee: z.coerce.number().min(0, "运费不能为负数").default(0),
  freeOver: z.coerce.number().min(0, "免邮门槛不能为负数").default(0),
  isCashOnDelivery: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  etaZh: z.string().trim().max(64).optional().nullable(),
  etaEn: z.string().trim().max(64).optional().nullable(),
});

/** POST /api/admin/shipping-methods — 新建（代号唯一性 + 格式友好校验） */
export const POST = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, createSchema);
  // 与历史行为一致：写入前统一小写 + 空格转短横线
  const code = input.code.toLowerCase().replace(/\s+/g, "-");
  if (!CODE_PATTERN.test(code)) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "代号仅支持小写字母、数字和短横线（如 sf-express），不能以短横线开头或结尾",
    );
  }
  const existing = await prisma.shippingMethod.findUnique({ where: { code } });
  if (existing) {
    throw new ApiError(
      409,
      "CODE_EXISTS",
      `代号「${code}」已被「${existing.name}」使用，请换一个代号`,
    );
  }
  const method = await prisma.shippingMethod.create({
    data: {
      code,
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
  // 商用审计补痕：运费模板直接影响订单应付金额，写操作必须留痕
  await audit({
    userId: actor.id,
    action: "ADMIN_SHIPPING_CREATE",
    entity: "ShippingMethod",
    entityId: method.id,
    meta: { code: method.code, fee: method.fee, freeOver: method.freeOver, isCashOnDelivery: method.isCashOnDelivery },
    req,
  });
  return json({ method }, { status: 201 });
});
