import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { submitReviewSchema } from "@/lib/validations/review";
import { listMyReviews, submitReview } from "@/server/services/review.service";
import { audit } from "@/lib/audit";

/** 我的评价列表（account 页） */
export const GET = apiHandler(async (req) => {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const data = await listMyReviews(user.id, searchParams);
  return json(data);
});

/** 提交/更新评价（绑定 DELIVERED 订单行 —— 真实购买凭证） */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, submitReviewSchema);
  const review = await submitReview({
    userId: user.id,
    orderItemId: input.orderItemId,
    rating: input.rating,
    title: input.title ?? null,
    content: input.content,
  });
  await audit({
    userId: user.id,
    action: "REVIEW_SUBMIT",
    entity: "Review",
    entityId: review.id,
    req,
    meta: { rating: input.rating, updated: review.updatedAt > review.createdAt },
  });
  return json({ review: { id: review.id, status: review.status } });
});
