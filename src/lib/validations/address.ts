import { z } from "zod";

/**
 * 收货地址校验（地址簿 /account/addresses）。
 *
 * 注意：地址簿面向国际客户，因此：
 * - phone 必须是**国际格式**（可选 + 前缀、允许空格/连字符/括号），不能只认中国手机号；
 * - 校验消息用英文（前台默认语言），中文界面由前端 i18n 字典覆盖；
 * - province/city/district 允许单字符，适配不同国家的行政区划（如美国无"区县"）。
 *
 * country / postalCode / line2 是后加字段（可为空）：
 * 结账页按原站表单收集这些信息后写入地址簿，下次结账可直接带出；
 * 历史数据没有这三项，故均为可选，不能设为必填（否则老地址无法编辑保存）。
 */

export const addressSchema = z.object({
  recipientName: z
    .string()
    .trim()
    .min(2, "Recipient name must be at least 2 characters")
    .max(30, "Recipient name is too long"),
  phone: z
    .string()
    .trim()
    // 国际号码：可选 + 前缀，允许空格 / 连字符 / 括号，总长 6-20
    .regex(/^\+?[\d\s\-()]{6,20}$/, "Please enter a valid phone number")
    // 至少 6 位数字（避免纯符号通过）
    .refine((v) => (v.match(/\d/g) ?? []).length >= 6, {
      message: "Please enter a valid phone number",
    }),
  province: z.string().trim().min(1, "Please enter a state / province / region").max(60),
  city: z.string().trim().min(1, "Please enter a city").max(60),
  district: z.string().trim().min(1, "Please enter a district / area").max(60),
  detail: z.string().trim().min(5, "Address must be at least 5 characters").max(120),
  /** 街道地址第二行（公寓/单元号） */
  line2: z.string().trim().max(120).optional().nullable(),
  /** 国家/地区 ISO alpha-2 */
  country: z
    .string()
    .trim()
    .length(2, "Please select a country / region")
    .optional()
    .nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  isDefault: z.boolean().optional().default(false),
});

export const addressUpdateSchema = addressSchema.partial();

export type AddressInput = z.infer<typeof addressSchema>;
