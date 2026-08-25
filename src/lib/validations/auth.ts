import { z } from "zod";
import { passwordSchema } from "@/lib/auth/password";

/** 认证相关校验 */

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("邮箱格式不正确").max(254),
  name: z.string().trim().min(2, "昵称至少 2 个字符").max(30, "昵称最长 30 个字符"),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("邮箱格式不正确"),
  password: z.string().min(1, "请输入密码").max(72),
  /** 登录入口:shop=前台;admin=后台(服务端强制校验角色,杜绝顾客账号进入管理端) */
  scope: z.enum(["shop", "admin"]).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("邮箱格式不正确"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码").max(72),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "昵称至少 2 个字符").max(30, "昵称最长 30 个字符"),
});

/** 修改登录邮箱：需验证当前密码，防止会话被劫持后篡改账号 */
export const changeEmailSchema = z.object({
  newEmail: z.string().trim().toLowerCase().email("新邮箱格式不正确").max(254),
  currentPassword: z.string().min(1, "请输入当前密码").max(72),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
