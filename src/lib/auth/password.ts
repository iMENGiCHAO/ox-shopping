import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 密码强度要求：8-72 位，含大写、小写、数字 */
export const passwordSchema = z
  .string()
  .min(8, "密码至少 8 位")
  .max(72, "密码最长 72 位")
  .regex(/[a-z]/, "密码必须包含小写字母")
  .regex(/[A-Z]/, "密码必须包含大写字母")
  .regex(/[0-9]/, "密码必须包含数字");

/** 密码强度评级(用于注册页实时提示) */
export function passwordStrength(plain: string): 0 | 1 | 2 | 3 {
  let score = 0;
  if (plain.length >= 8) score++;
  if (/[a-z]/.test(plain) && /[A-Z]/.test(plain) && /[0-9]/.test(plain)) score++;
  if (/[^a-zA-Z0-9]/.test(plain)) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}
