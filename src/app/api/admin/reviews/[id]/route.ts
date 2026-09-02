import { apiHandler, json, readJson } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { routeParam } from "@/app/api/_lib/params";
import { reviewHideSchema } from "../route";

export const runtime = "nodejs";

/**
 * GET /api/admin/reviews/[id] — 单条评论详情（含关联用户、商品、订单项）
 */
export const GET = apiHandler(async (req, ctx) => {
  await requireStaff();
  const id = routeParam(ctx.params.id);
  const row = await prisma.review.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      product: { select: { id: true, name: true, slug: true } },
      orderItem: { select: { id: true, orderId: true } },
    },
  });
  if (!row) throw notFound("评论不存在");
  return json({ data: row });
});

/**
 * PATCH /api/admin/reviews/[id] — 隐藏/显示
 */
export const PATCH = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, reviewHideSchema);

  const exists = await prisma.review.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound("评论不存在");

  const row = await prisma.review.update({
    where: { id },
    data: { isHidden: input.isHidden },
  });

  await audit({
    userId: actor.id,
    action: input.isHidden ? "ADMIN_REVIEW_HIDE" : "ADMIN_REVIEW_SHOW",
    entity: "Review",
    entityId: id,
    req,
  });
  return json({ data: row });
});

/**
 * DELETE /api/admin/reviews/[id] — 物理删除（敏感内容、违规）
 */
export const DELETE = apiHandler(async (req, ctx) => {
  const actor = await requireStaff();
  const id = routeParam(ctx.params.id);

  const row = await prisma.review.findUnique({
    where: { id },
    include: { product: { select: { name: true } } },
  });
  if (!row) throw notFound("评论不存在");

  await prisma.review.delete({ where: { id } });

  await audit({
    userId: actor.id,
    action: "ADMIN_REVIEW_DELETE",
    entity: "Review",
    entityId: id,
    meta: { productName: row.product.name, hidden: row.isHidden },
    req,
  });
  return json({ data: { ok: true } });
});
