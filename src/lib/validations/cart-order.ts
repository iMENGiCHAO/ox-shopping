import { z } from "zod";
import { MAX_CART_ITEM_QUANTITY } from "@/lib/constants";

/** Shopping Bag */

/** 下单规格选择([{ name, value }]，如 颜色=曜石黑) */
export const selectedAttributesSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "Attribute name is required").max(30),
      value: z.string().trim().min(1, "Attribute value is required").max(50),
    }),
  )
  .max(20, "At most 20 attributes")
  .optional();

export const cartAddSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(MAX_CART_ITEM_QUANTITY),
  attributes: selectedAttributesSchema,
});

export const cartUpdateSchema = z.object({
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(MAX_CART_ITEM_QUANTITY),
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

/**
 * 结账页收货地址（内联填写）——字段与**原站结账页逐项对齐**：
 * Country/Region · First name · Last name · Address · Apartment, suite, etc. · City · State · ZIP code。
 *
 * 为什么不用 addresses 表的结构：原站结账页（Shopify checkout）是分国别的西式表单，
 * 字段集与地址簿（国内式 recipientName/phone/province/city/district/detail）不同。
 * 结账页按原站字段收，服务端在 order.service 里映射成订单快照——
 * 两条入口（地址簿 / 结账页内联）最终落到同一份 AddressSnapshot，下游展示只需认一种结构。
 */
export const checkoutAddressSchema = z.object({
  /** 国家/地区 ISO alpha-2（表单里是 Country/Region 下拉） */
  country: z.string().trim().min(2).max(2),
  firstName: z.string().trim().min(1, "Please fill in the shipping address").max(40),
  lastName: z.string().trim().min(1, "Please fill in the shipping address").max(40),
  /** 街道地址第一行（原站 Address） */
  line1: z.string().trim().min(1, "Please fill in the shipping address").max(200),
  /** 街道地址第二行（原站 Apartment, suite, etc. (optional)） */
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1, "Please fill in the shipping address").max(60),
  /** 州/省（原站 State；美国/加拿大为下拉，其余为文本） */
  state: z.string().trim().min(1, "Please fill in the shipping address").max(60),
  postalCode: z.string().trim().min(1, "Please fill in the shipping address").max(20),
  /**
   * 联系电话。原站仅对**部分国家/地区**要求（当地承运商必需），
   * 因此这里可选，由前端按所选国家决定是否必填（见 @/lib/countries 的 phone 标记）。
   */
  phone: z.string().trim().max(30).optional().nullable(),
});

/** 券码：统一 trim + 大写（与 coupon.service 的 normalizeCouponCode 同口径） */
const couponCodeSchema = z.string().trim().max(64).optional().nullable();

/**
 * 下单入参。两条互斥路径：
 *   - 登录单：addressId（已保存地址）
 *   - 游客单：contactEmail + shippingAddress（内联地址）
 * 用 superRefine 而不是 discriminatedUnion：两者字段都可选，
 * 且前端在「已登录但想用新地址」时也可能同时提交，交给服务端判优先级更稳。
 */
export const orderCreateSchema = z
  .object({
    items: z.array(orderItemInputSchema).min(1, "Shopping Bag is empty").max(50),
    /** 登录单：已保存地址 id */
    addressId: z.string().min(1).optional().nullable(),
    /** 游客单：联系邮箱（订单确认/物流通知的收件人） */
    contactEmail: z
      .string()
      .trim()
      .email("Please enter a valid email address")
      .max(254)
      .optional()
      .nullable(),
    /** 结账页内联收货地址（游客单必填；登录单可改填一次性新地址） */
    shippingAddress: checkoutAddressSchema.optional().nullable(),
    /** 物流方式 code（DB 中 ShippingMethod.code；默认 "standard"） */
    shippingMethod: z.string().trim().min(1).max(64).default("standard"),
    note: z.string().trim().max(300).optional().nullable(),
    /** 支付渠道 code（payment_channels.code）；缺省走现有 stripe/mock 自动模式 */
    channelCode: z.string().trim().min(1).max(64).optional(),
    /** 折扣码（券码）。空 = 不使用折扣。 */
    couponCode: couponCodeSchema,
    /** 下单幂等键（客户端 crypto.randomUUID）：防「双击下单=两张单扣两份库存」。
     *  网络失败重试时客户端复用同一 key——服务端命中唯一约束直接返回首张单；
     *  不传（老客户端）为 NULL 不参与约束，行为与从前一致。 */
    idempotencyKey: z.string().uuid().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.addressId && !val.shippingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shippingAddress"],
        message: "Please fill in the shipping address",
      });
    }
    // 游客单必须有联系邮箱：它是订单邮件、游客查单、每人限次券的唯一凭据
    if (!val.addressId && val.shippingAddress && !val.contactEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactEmail"],
        message: "Please enter your email",
      });
    }
  });

/**
 * 折扣码试算入参。
 * 必须带 items + shippingMethod：折扣与运费门槛都依赖购物车内容，
 * 而**金额一律由服务端按 DB 现价重算**（不接受前端传金额，杜绝篡改）。
 */
export const couponApplySchema = z.object({
  code: z.string().trim().min(1, "Enter a discount code").max(64),
  items: z.array(orderItemInputSchema).min(1, "Shopping Bag is empty").max(50),
  shippingMethod: z.string().trim().min(1).max(64).default("standard"),
  /** 游客单的联系邮箱（每人限次判定用） */
  contactEmail: z.string().trim().email().max(254).optional().nullable(),
});

export const refundRequestSchema = z.object({
  reason: z.string().trim().min(5, "Refund reason must be at least 5 characters").max(500),
  amount: z.number().min(0.01, "Refund amount must be greater than 0").max(99999999),
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;