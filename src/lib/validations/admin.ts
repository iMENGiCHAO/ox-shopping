import { z } from "zod";

/** 管理端：用户管理 */

export const userStatusSchema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]),
});

/** 管理端：编辑用户(昵称/邮箱/角色/状态) */
export const adminUserUpdateSchema = z.object({
  name: z.string().trim().min(2, "昵称至少 2 个字符").max(30).optional(),
  email: z.string().trim().toLowerCase().email("邮箱格式不正确").max(254).optional(),
  role: z.enum(["ADMIN", "CUSTOMER", "SUPPORT"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

/** 管理端：重置用户密码 */
export const adminResetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "密码至少 8 位")
    .max(72)
    .regex(/[a-z]/, "必须包含小写字母")
    .regex(/[A-Z]/, "必须包含大写字母")
    .regex(/[0-9]/, "必须包含数字"),
});

/** 管理端：发货 */

export const shipOrderSchema = z.object({
  trackingCompany: z.string().trim().min(2, "请填写物流公司").max(50),
  trackingNumber: z.string().trim().min(4, "请填写物流单号").max(64),
});

/** 管理端：退款审核 */

export const refundReviewSchema = z.object({
  adminNote: z.string().trim().max(500).optional().nullable(),
});

/** 管理端：订单状态修改 */

export const orderStatusUpdateSchema = z.object({
  status: z.enum(["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"]),
});

/** 管理端：批量修改订单状态（一次最多 50 单，防止超长事务/超时） */
export const batchOrderStatusSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, "请选择至少一个订单").max(50, "单次最多 50 单"),
  status: z.enum(["PROCESSING", "SHIPPED", "CANCELLED", "REFUNDED"]),
});

/** 管理端：修改订单收货地址（addressSnapshot 的字段与下单时同形） */
export const orderAddressUpdateSchema = z.object({
  recipientName: z.string().trim().min(1, "请填写收件人").max(100),
  phone: z.string().trim().max(40).optional().nullable(),
  country: z.string().trim().max(60).optional().nullable(),
  province: z.string().trim().max(60).optional().nullable(),
  city: z.string().trim().max(60).optional().nullable(),
  district: z.string().trim().max(60).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  detail: z.string().trim().min(1, "请填写详细地址").max(300),
});

/** 管理端：订单内部备注（仅后台可见，不会发给顾客） */
export const orderAdminNoteSchema = z.object({
  /** 传空串 = 清空备注 */
  adminNote: z.string().trim().max(2000),
});

/** 管理端：站点设置 */

export const siteSettingsSchema = z.record(z.string().min(1), z.unknown());

/** 数据删除请求 */

export const dataDeletionSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});
