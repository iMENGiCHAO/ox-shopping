import { apiHandler, json, jsonPaginated, readJson, searchParam } from "@/lib/api";
import { requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
import { Prisma } from "@prisma/client";
import { z } from "zod";

export const runtime = "nodejs";

/**
 * GET /api/admin/reviews
 * 列表支持：
 *  - q：评论内容/商品名/用户邮箱模糊匹配
 *  - productId：限定商品
 *  - isHidden：true/false 过滤是否隐藏
 */
export const GET = apiHandler(async (req) => {
  await requireStaff();
  const sp = new URL(req.url).searchParams;
  const q = searchParam(sp, "q");
  const productId = searchParam(sp, "productId");
  const isHiddenRaw = searchParam(sp, "isHidden");
  const { page, pageSize, skip, take } = parsePagination(sp);

  const where: Prisma.ReviewWhereInput = {};
  if (q) {
    where.OR = [
      { comment: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { product: { is: { name: { contains: q, mode: "insensitive" } } } },
      { user: { is: { email: { contains: q, mode: "insensitive" } } } },
    ];
  }
  if (productId) where.productId = productId;
  if (isHiddenRaw === "true") where.isHidden = true;
  if (isHiddenRaw === "false") where.isHidden = false;

  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.review.count({ where }),
  ]);

  return jsonPaginated(rows, {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});

const reviewHideSchema = z.object({
  isHidden: z.boolean(),
});

/**
 * POST /api/admin/reviews
 * 批量设置隐藏/显示。Body: { ids: string[]; isHidden: boolean }
 */
const reviewBatchHideSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  isHidden: z.boolean(),
});

export const POST = apiHandler(async (req) => {
  const actor = await requireStaff();
  const input = await readJson(req, reviewBatchHideSchema);

  const result = await prisma.review.updateMany({
    where: { id: { in: input.ids } },
    data: { isHidden: input.isHidden },
  });

  await audit({
    userId: actor.id,
    action: "ADMIN_REVIEW_BATCH_HIDE",
    entity: "Review",
    meta: { ids: input.ids, isHidden: input.isHidden, updated: result.count },
    req,
  });
  return json({ updated: result.count });
});

// 为方便单条更新也提供 schema（被 [id] 路由复用）
export { reviewHideSchema };
