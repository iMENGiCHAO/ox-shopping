import { apiHandler, json, jsonPaginated, readJson } from "@/lib/api";
import { badRequest, conflict } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
import { couponCreateSchema } from "@/lib/validations/cart-order";

export const runtime = "nodejs";

/** GET /api/admin/coupons */
export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip, take } = parsePagination(sp);

  const [rows, total] = await Promise.all([
    prisma.coupon.findMany({
      include: { _count: { select: { redemptions: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.coupon.count(),
  ]);

  return jsonPaginated(rows, {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});

/** POST /api/admin/coupons */
export const POST = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, couponCreateSchema);

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw badRequest("日期格式不正确");
  }
  if (endsAt <= startsAt) throw badRequest("结束时间必须晚于开始时间");

  const code = input.code.toUpperCase();
  const dup = await prisma.coupon.findUnique({ where: { code } });
  if (dup) throw conflict("Discount码已存在");

  const coupon = await prisma.coupon.create({
    data: { ...input, code, startsAt, endsAt },
  });

  await audit({
    userId: actor.id,
    action: "ADMIN_COUPON_CREATE",
    entity: "Coupon",
    entityId: coupon.id,
    meta: { code },
    req,
  });
  return json({ coupon });
});
