import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError, badRequest, forbidden, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { createNotification, notifyAdmins } from "@/server/services/notification.service";
import { parsePagination } from "@/lib/utils";
import type { Prisma, ReviewStatus } from "@prisma/client";

/**
 * 评价系统服务层（交付终审补全：评价/收藏为大爷点名的「完善系统」项）。
 *
 * 商业逻辑约束（反刷评、反数据孤岛）：
 *   1. 仅登录用户可评（游客无购买凭证）
 *   2. 仅 DELIVERED 订单行可评（确认收货后 —— 顶级电商口径，未收货评价无意义）
 *   3. 一订单行一评（orderItemId 唯一约束）；重购同品再评 = 更新已有评价
 *      （productId+userId 唯一），不产生第二条
 *   4. 默认 APPROVED 即时展示（真实购买门槛已高）；admin 可 REJECTED 下架
 *   5. 商品冗余列 ratingAvg/ratingCount 由本服务统一重算（唯一写入点）
 */

/** 评价展示名脱敏：「张三」→「张*」，「Wei Zhang」→「W*」；已注销匿名化名原样展示 */
export function maskReviewerName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "—";
  const first = [...n][0]!;
  return n.length <= 1 ? first : `${first}${"*".repeat(Math.min(n.length - 1, 3))}`;
}

export interface SubmitReviewInput {
  userId: string;
  orderItemId: string;
  rating: number;
  title?: string | null;
  content: string;
}

/** 校验订单行可评性并定位商品（创建/更新共用）。 */
async function requireReviewableOrderItem(userId: string, orderItemId: string) {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: {
      order: { select: { userId: true, status: true, orderNumber: true } },
      product: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!item || !item.order.userId || item.order.userId !== userId) {
    throw notFound("Order item not found");
  }
  // DELIVERED 是确认收货终态：未收货的订单没有「使用体验」可评
  if (item.order.status !== "DELIVERED") {
    throw badRequest("Only delivered orders can be reviewed. Please confirm receipt first.");
  }
  if (!item.product) {
    throw badRequest("This product no longer exists and cannot be reviewed.");
  }
  // 返回紧化结构：product 已确非空，调用方免受 TS 流分析窄化丢失之苦
  return {
    orderItemId: item.id,
    productId: item.product.id,
    productSlug: item.product.slug,
    productName: item.product.name,
  };
}

/** 唯一评分聚合重算点：增/改/删/上下架后调用（部分更新走事务外此处集中） */
async function recomputeProductRating(productId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { productId, status: "APPROVED" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10,
      ratingCount: agg._count._all,
    },
  });
}

/** 提交/更新评价（一人一品一评，重购再评=更新）。 */
export async function submitReview(input: SubmitReviewInput) {
  if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
    throw badRequest("Rating must be an integer between 1 and 5.");
  }
  const item = await requireReviewableOrderItem(input.userId, input.orderItemId);

  // 一人品一评：已有评价（无论哪条订单行）→ 更新，且不允许改回别人订单行
  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId: item.productId, userId: input.userId } },
  });
  if (existing && existing.orderItemId !== input.orderItemId) {
    throw badRequest(
      "You already reviewed this product. Open your existing review to edit it instead.",
    );
  }

  const review = existing
    ? await prisma.review.update({
        where: { id: existing.id },
        // 更新回到 APPROVED（admin 下架后用户修改 = 重新进入展示池）
        data: {
          rating: input.rating,
          title: input.title ?? null,
          content: input.content,
          status: "APPROVED",
          orderItemId: input.orderItemId,
        },
      })
    : await prisma.review.create({
        data: {
          productId: item.productId,
          userId: input.userId,
          orderItemId: item.orderItemId,
          rating: input.rating,
          title: input.title ?? null,
          content: input.content,
        },
      });

  await recomputeProductRating(item.productId);

  // 站内通知管理员：新评价进池（低频事件直接 notifyAdmins，不排队列）
  void notifyAdmins({
    type: "system",
    title: "收到新商品评价",
    titleEn: "New product review received",
    body: `「${item.productName}」收到 ${input.rating} 星评价，点击查看。`,
    bodyEn: `"${item.productName}" received a ${input.rating}-star review. Click to view.`,
    link: `/admin/reviews`,
    meta: { reviewId: review.id, productSlug: item.productSlug, rating: input.rating },
  }).catch(() => {
    // notifyAdmins 失败不阻塞提交（fire-and-forget 语义）
  });

  return review;
}

/** 删除自己的评价（软退出：行删 + 聚合重算）。 */
export async function deleteMyReview(userId: string, reviewId: string) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw notFound("Review not found");
  if (review.userId !== userId) throw forbidden("Not your review");
  await prisma.review.delete({ where: { id: reviewId } });
  await recomputeProductRating(review.productId);
  return true;
}

/** 商品公开评价列表（仅 APPROVED；分页；脱敏名）。 */
export async function listProductReviews(slugOrId: string, searchParams: URLSearchParams) {
  // 兼容 slug 与数据库 id（API 路由段名受 Next 同层动态段约束，参数语义放宽）
  const product = await prisma.product.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    select: { id: true },
  });
  if (!product) throw notFound("Product not found");
  const { skip, take, page } = parsePagination(searchParams, { page: 1, pageSize: 10 });
  const where = { productId: product.id, status: "APPROVED" as ReviewStatus };
  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        rating: true,
        title: true,
        content: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.review.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      content: r.content,
      authorName: maskReviewerName(r.user?.name),
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: take,
  };
}

/** 我的评价（account 页）。 */
export async function listMyReviews(userId: string, searchParams: URLSearchParams) {
  const { skip, take, page } = parsePagination(searchParams, { page: 1, pageSize: 10 });
  const where = { userId };
  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        product: { select: { slug: true, name: true, nameEn: true, images: true } },
      },
    }),
    prisma.review.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      content: r.content,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      product: { slug: r.product.slug, name: r.product.nameEn ?? r.product.name },
    })),
    total,
    page,
    pageSize: take,
  };
}

/** 可评价的订单行（订单详情/我的订单页「写评价」入口的数据源）。 */
export async function listReviewableItems(userId: string, orderNumber: string) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { id: true, userId: true, status: true },
  });
  if (!order || order.userId !== userId) throw notFound("Order not found");
  if (order.status !== "DELIVERED") return { rows: [], reviewable: false };
  const rows = await prisma.orderItem.findMany({
    where: { orderId: order.id, productId: { not: null } },
    select: {
      id: true,
      productName: true,
      attributes: true,
      review: { select: { id: true } },
    },
  });
  return {
    reviewable: true,
    rows: rows.map((i) => ({
      orderItemId: i.id,
      productName: i.productName,
      attributes: i.attributes as { name: string; value: string }[] | null,
      reviewed: i.review != null,
    })),
  };
}

/** admin：评价列表（含未过审/已下架）。 */
export async function adminListReviews(searchParams: URLSearchParams) {
  const { skip, take, page } = parsePagination(searchParams, { page: 1, pageSize: 20 });
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();
  const where: Prisma.ReviewWhereInput = {
    ...(status === "APPROVED" || status === "REJECTED" ? { status } : {}),
    ...(q
      ? {
          OR: [
            { content: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        product: { select: { slug: true, name: true, nameEn: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.review.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      content: r.content,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      product: { slug: r.product.slug, name: r.product.nameEn ?? r.product.name },
      authorName: r.user?.name ?? "—",
      authorEmail: r.user?.email ?? "—",
    })),
    total,
    page,
    pageSize: take,
  };
}

/** admin：下架/恢复（重算聚合）。 */
export async function adminSetReviewStatus(
  actor: { id: string },
  reviewId: string,
  status: ReviewStatus,
) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw notFound("Review not found");
  await prisma.review.update({ where: { id: reviewId }, data: { status } });
  await recomputeProductRating(review.productId);
  await audit({
    userId: actor.id,
    action: status === "REJECTED" ? "REVIEW_REJECT" : "REVIEW_APPROVE",
    entity: "Review",
    entityId: reviewId,
    meta: { productId: review.productId, rating: review.rating },
  });
  return true;
}
