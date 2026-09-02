import { apiHandler, json, jsonPaginated, readJson } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
import { sanitizePlainText } from "@/lib/sanitize";
import { reviewCreateSchema } from "@/lib/validations/cart-order";
import { z } from "zod";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** GET /api/user/reviews — 我的评价 */
export const GET = apiHandler(async (req) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const { page, pageSize, skip, take } = parsePagination(sp);

  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where: { userId: user.id },
      include: { product: { select: { id: true, name: true, slug: true, images: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.review.count({ where: { userId: user.id } }),
  ]);
  return jsonPaginated(rows, {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});

const reviewCreateBodySchema = reviewCreateSchema.extend({
  productId: z.string().min(1),
});

/** POST /api/user/reviews — 提交评价（必须存在一笔已 DELIVERED 的订单项） */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, reviewCreateBodySchema);

  // 限流：单用户每天最多 10 条
  const rl = await rateLimit({
    key: `user-review:${user.id}`,
    limit: 10,
    windowSeconds: 86400,
  });
  if (!rl.ok) throw badRequest("今日评价次数已达上限");

  // 净化：comment/title 去 HTML（防 XSS；React 渲染默认转义为纵深防御）
  const comment = (await sanitizePlainText(input.comment)).trim();
  if (comment.length < 5) throw badRequest("Reviews内容至少 5 个字符");
  const title = input.title ? (await sanitizePlainText(input.title)).trim() || null : null;

  // 验证商品存在
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw notFound("商品不存在");

  // 若关联了 orderItemId，验证归属
  if (input.orderItemId) {
    const orderItem = await prisma.orderItem.findUnique({
      where: { id: input.orderItemId },
      include: { order: true },
    });
    if (!orderItem || orderItem.order.userId !== user.id) {
      throw badRequest("订单项无效或不属于当前用户");
    }
    if (orderItem.order.status !== "DELIVERED" && orderItem.order.status !== "SHIPPED") {
      throw badRequest("仅已发货/已签收订单可评价");
    }
  }

  try {
    const review = await prisma.review.create({
      data: {
        userId: user.id,
        productId: product.id,
        orderItemId: input.orderItemId ?? null,
        rating: input.rating,
        title,
        comment,
        images: input.images as unknown as Prisma.InputJsonValue,
      },
    });
    await audit({
      userId: user.id,
      action: "USER_REVIEW_CREATE",
      entity: "Review",
      entityId: review.id,
      meta: { productId: product.id, rating: input.rating },
      req,
    });
    return json({ data: review });
  } catch (err) {
    // 唯一约束 (userId, productId) 重复
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw badRequest("您已对该商品评价过");
    }
    throw err;
  }
});
