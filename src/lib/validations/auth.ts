import { z } from "zod";
import { passwordSchema } from "@/lib/auth/password";

/**
 * 认证相关校验。
 *
 * 文案语言：**英文**（与 `address.ts` 同一约定）——
 *   前台英文界面直接用；中文界面由 `lib/error-i18n` 的 `ERROR_ZH` 在
 *   API 错误出口按请求语言替换（含 `details[].message` 字段级消息）。
 *   前台表单（登录/注册）各自用 `t()` 构造本地化 schema，不直接复用这里。
 */

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email format").max(254),
  // 注册页按原站拆成 First name / Last name 两个输入框，提交时拼成一个 name，
  // 故上限放宽到 60（30+空格+29），否则合法的长名会被服务端拒掉。
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(60, "Name must be at most 60 characters"),
  password: passwordSchema,
  /**
   * 蜜罐字段（防脚本灌水）：前台注册表单里对人类不可见；机器人自动填表常会把
   * 隐藏的文本框一并填上。服务端非空即静默拒绝（route 层处理，schema 只放行）。
   */
  company: z.string().max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email format"),
  password: z.string().min(1, "Please enter your password").max(72),
  /** 登录入口:shop=前台;admin=后台(服务端强制校验角色,杜绝顾客账号进入管理端) */
  scope: z.enum(["shop", "admin"]).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email format"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Please enter your current password").max(72),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(60, "Name must be at most 60 characters"),
});

/** 修改登录邮箱：需验证当前密码，防止会话被劫持后篡改账号 */
export const changeEmailSchema = z.object({
  newEmail: z.string().trim().toLowerCase().email("Invalid email format").max(254),
  currentPassword: z.string().min(1, "Please enter your current password").max(72),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
