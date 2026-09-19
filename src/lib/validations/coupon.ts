import { z } from "zod";

/**
 * 折扣码（优惠券）后台管理入参。
 *
 * 金额字段（value / minSpend / maxDiscount）一律是**基础币种 USD**，
 * 与 coupon.service 的计算口径一致——后台录入时不按结算币种换算，
 * 避免「按 EUR 录券、USD 站结算」这类跨币种错账。
 */

const money = z.coerce.number().min(0).max(9_999_999);

/** 券码：trim + 大写（与 normalizeCouponCode 同口径，库里统一存大写） */
const codeSchema = z
  .string()
  .trim()
  .min(2, "Coupon code must be at least 2 characters")
  .max(64, "Coupon code must be at most 64 characters")
  .regex(/^[A-Za-z0-9_-]+$/, "Coupon code may only contain letters, numbers, - and _")
  .transform((s) => s.toUpperCase());

export const couponSchema = z
  .object({
    code: codeSchema,
    type: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]),
    /** PERCENTAGE: 1..100；FIXED: 减免金额(USD)；FREE_SHIPPING: 忽略（存 0） */
    value: money.default(0),
    minSpend: money.default(0),
    maxDiscount: money.optional().nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    /** 0 = 不限量 */
    usageLimit: z.coerce.number().int().min(0).max(1_000_000).default(0),
    /** 每人可用次数；0 = 不限 */
    perUserLimit: z.coerce.number().int().min(0).max(1000).default(1),
    /** 是否在公开领券页露出 */
    isPublic: z.boolean().default(false),
    title: z.string().trim().max(80).optional().nullable(),
    titleEn: z.string().trim().max(80).optional().nullable(),
    description: z.string().trim().max(300).optional().nullable(),
    descriptionEn: z.string().trim().max(300).optional().nullable(),
    isActive: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.endsAt <= val.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "End time must be later than start time",
      });
    }
    if (val.type === "PERCENTAGE" && (val.value <= 0 || val.value > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Percentage must be between 1 and 100",
      });
    }
    if (val.type === "FIXED" && val.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Fixed amount must be greater than 0",
      });
    }
    if (val.maxDiscount != null && val.maxDiscount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDiscount"],
        message: "Cap must be greater than 0",
      });
    }
    // 公开露出却没有文案：领券页会显示空白卡片，直接拦在录入阶段
    if (val.isPublic && !val.title?.trim() && !val.titleEn?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["title"],
        message: "Public coupons need a title",
      });
    }
  });

/**
 * 校验后的入参类型。
 *
 * 刻意用 `z.input` 而不是 `z.infer`(= `z.output`)：`readJson(req, schema)` 的泛型
 * 在 TS 侧推断落到 schema 的 **input** 侧，`.default()` 字段因此仍标为可选
 * （运行时其实已被 safeParse 填好）。用 output 类型会导致每个调用点都报
 * 「number | undefined 不能赋给 number」。
 * 副作用是好的：它逼着调用点显式写 `?? 默认值`，与 `.default()` 形成双保险。
 */
export type CouponInput = z.input<typeof couponSchema>;

/** schema 解析后的严格输出类型（所有 `.default()` 字段均已填充） */
export type CouponParsed = z.output<typeof couponSchema>;

/**
 * 局部更新入参（列表里的「启用」开关）。
 *
 * 为什么单独一个 schema 而不是复用 couponSchema：开关只改一个布尔字段，
 * 若走全量 PUT，前端必须把整行数据回传，任何一处字段缺失都会被判为非法，
 * 开关这种高频轻操作会被无关字段的校验挡住。
 */
export const couponToggleSchema = z.object({
  isActive: z.boolean(),
});
