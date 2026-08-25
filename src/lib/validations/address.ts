import { z } from "zod";

/** 收货地址 */

export const addressSchema = z.object({
  recipientName: z.string().trim().min(2, "收件人姓名至少 2 个字符").max(30),
  phone: z
    .string()
    .trim()
    // 中国手机号 1[3-9]xxxxxxxxx，或带区号的座机 0755-12345678
    .regex(/^(1[3-9]\d{9}|\d{3,4}-\d{7,8})$/, "请填写正确的手机号或座机号(区号-号码)"),
  province: z.string().trim().min(2, "请填写省份").max(20),
  city: z.string().trim().min(2, "请填写城市").max(20),
  district: z.string().trim().min(2, "请填写区县").max(20),
  detail: z.string().trim().min(5, "详细地址至少 5 个字符").max(120),
  isDefault: z.boolean().optional().default(false),
});

export const addressUpdateSchema = addressSchema.partial();

export type AddressInput = z.infer<typeof addressSchema>;
