import { z } from "zod";

/** 提交/更新评价（服务层再校验订单行归属与 DELIVERED 状态） */
export const submitReviewSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z
    .number()
    .int("Rating must be an integer")
    .min(1, "Rating must be at least 1 star")
    .max(5, "Rating must be at most 5 stars"),
  title: z.string().trim().max(120).optional().nullable(),
  content: z
    .string()
    .trim()
    .min(5, "Review content must be at least 5 characters")
    .max(2000, "Review content is too long"),
});

export type SubmitReviewPayload = z.infer<typeof submitReviewSchema>;

export const reviewStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export const favoriteToggleSchema = z.object({
  productId: z.string().min(1),
});
