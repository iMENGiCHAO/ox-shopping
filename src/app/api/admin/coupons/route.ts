import { apiHandler, json, jsonPaginated, readJson, searchParam } from "@/lib/api";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { serializeCoupon } from "@/server/serializers";
import { couponSchema, type CouponInput } from "@/lib/validations/coupon";
import { parsePagination } from "@/lib/utils";
import { badRequest } from "@/lib/errors";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/**
 * 把校验后的入参映射为 Prisma 写入数据。
 *
 * 刻意**显式逐字段**构造而不是 `...input` 展开：
 *   1) schema 里的 `.default()` 只保证解析后的运行时值，TS 侧 readJson 的泛型
 *      推断会落到 input 侧，展开后字段类型带上 `undefined`，与 Prisma 的必填校验冲突；
 *   2) 券码归一化规则（免邮券 value 归零、封顶只对百分比券有效）需要集中表达，
 *      散在 POST/PUT 两处必然漂移。
 */
function couponDataFromInput(input: CouponInput) {
  return {
    code: input.code,
    type: input.type,
    // FREE_SHIPPING 的 value 无意义，统一存 0：避免后台误填金额后在列表里
    // 显示成一个「看起来有减免额」的券，造成运营误判。
    value: input.type === "FREE_SHIPPING" ? 0 : (input.value ?? 0),
    minSpend: input.minSpend ?? 0,
    // 封顶只对百分比券有意义，其余类型清空，杜绝「固定额券又带封顶」的矛盾配置
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

/** GET /api/admin/coupons — 券码列表（分页 + 券码搜索 + 状态筛选） */
export const GET = apiHandler(async (req) => {
  await requireStaff();

  const sp = new URL(req.url).searchParams;
  const q = searchParam(sp, "q");
  const status = searchParam(sp, "status");
  const { page, pageSize, skip, take } = parsePagination(sp);

  const where: Prisma.CouponWhereInput = {};
  // 券码统一大写存储，搜索词同步大写，否则小写输入永远搜不到
  if (q) where.code = { contains: q.toUpperCase() };
  if (status === "active") where.isActive = true;
  if (status === "inactive") where.isActive = false;
  if (status === "expired") where.endsAt = { lt: new Date() };

  const [rows, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take,
      include: { _count: { select: { redemptions: true } } },
    }),
    prisma.coupon.count({ where }),
  ]);

  return jsonPaginated(rows.map(serializeCoupon), {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});

/** POST /api/admin/coupons — 新建券码 */
export const POST = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, couponSchema);

  const exists = await prisma.coupon.findUnique({ where: { code: input.code } });
  if (exists) throw badRequest("This coupon code already exists");

  const coupon = await prisma.coupon.create({ data: couponDataFromInput(input) });

  await audit({
    userId: actor.id,
    action: "ADMIN_COUPON_CREATE",
    entity: "Coupon",
    entityId: coupon.id,
    meta: { code: coupon.code, type: coupon.type },
    req,
  });

  return json({ coupon: serializeCoupon(coupon) });
});
