import { z } from "zod";
import { MAX_CART_ITEM_QUANTITY } from "@/lib/constants";

/** Shopping Bag */

/** 下单规格选择([{ name, value }]，如 颜色=曜石黑) */
export const selectedAttributesSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "规格名不能为空").max(30),
      value: z.string().trim().min(1, "规格值不能为空").max(50),
    }),
  )
  .max(20, "规格最多 20 项")
  .optional();

export const cartAddSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1, "数量至少为 1").max(MAX_CART_ITEM_QUANTITY),
  attributes: selectedAttributesSchema,
});

export const cartUpdateSchema = z.object({
  quantity: z.number().int().min(1, "数量至少为 1").max(MAX_CART_ITEM_QUANTITY),
});

export const cartMergeSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(MAX_CART_ITEM_QUANTITY),
        attributes: selectedAttributesSchema,
      }),
    )
    .max(50),
});

/** 订单 */

export const orderItemInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(MAX_CART_ITEM_QUANTITY),
  attributes: selectedAttributesSchema,
});

export const orderCreateSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, "Shopping Bag为空").max(50),
  addressId: z.string().min(1, "请选择收货地址"),
  couponCode: z.string().trim().max(64).optional().nullable(),
  /** 物流方式 code（DB 中 ShippingMethod.code；默认 "standard"） */
  shippingMethod: z.string().trim().min(1).max(64).default("standard"),
  note: z.string().trim().max(300).optional().nullable(),
});

export const refundRequestSchema = z.object({
  reason: z.string().trim().min(5, "退款原因至少 5 个字符").max(500),
  amount: z.number().min(0.01, "退款金额必须大于 0").max(99999999),
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

/** Reviews */

export const reviewCreateSchema = z.object({
  orderItemId: z.string().optional().nullable(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional().nullable(),
  comment: z.string().trim().min(5, "Reviews内容至少 5 个字符").max(1000),
  images: z.array(z.string().url().max(2048)).max(9).default([]),
});

export const reviewModerateSchema = z.object({
  isHidden: z.boolean(),
});

/** Discount券(管理端) */

export const couponCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Discount码至少 3 个字符")
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Discount码只能包含字母、数字、下划线和连字符"),
  type: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]),
  value: z.number().min(0).max(10000),
  minSpend: z.number().min(0).max(99999999).default(0),
  maxDiscount: z.number().min(0).max(99999999).nullable().optional(),
  startsAt: z.string().datetime().or(z.string().min(1)),
  endsAt: z.string().datetime().or(z.string().min(1)),
  usageLimit: z.number().int().min(0).max(99999999).default(0),
  isActive: z.boolean().default(true),
});

export const couponUpdateSchema = couponCreateSchema.partial();

export const couponApplySchema = z.object({
  code: z.string().trim().min(1).max(64),
  subtotal: z.number().min(0).max(99999999),
});

export type CouponCreateInput = z.infer<typeof couponCreateSchema>;
