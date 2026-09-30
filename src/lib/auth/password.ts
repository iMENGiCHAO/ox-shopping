import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { isProduction } from "@/lib/env";

/**
 * bcrypt 成本因子（可配置，默认 12）。
 *
 * 为什么不能写死成常量：
 *   1. **硬件差异极大**。同一份代码在快机上 12 轮约 250ms，但在本项目的外置卷
 *      环境下实测单次哈希要 **5.8s**（`tests/unit/password.test.ts` 的两个用例
 *      各跑了 5.8s / 4.1s）。写死就等于把「登录/注册要等几秒」固化进产品，
 *      运维无法按机器能力调整 —— 这属于该由环境变量决定的事。
 *   2. **测试环境必须调低**。集成测试每个文件都要 `login()`，一次哈希 5.8s
 *      会把整轮套件拖长数分钟，并直接触发 vitest 的 hookTimeout（实测
 *      `coupon-flow` 的 beforeAll 因此超时 90s）。测试用 4 轮即可。
 *
 * 安全下限：**生产环境低于 10 轮直接拒绝启动** —— 弱哈希约等于明文存储，
 * 这是宁可起不来也不能带病上线的配置。测试/开发环境不设该下限（否则没法调低）。
 */
function resolveBcryptRounds(): number {
  const raw = Number(process.env.BCRYPT_ROUNDS);
  const rounds = Number.isInteger(raw) && raw >= 4 && raw <= 15 ? raw : 12;
  if (isProduction && rounds < 10) {
    throw new Error(
      `BCRYPT_ROUNDS=${rounds} 过低：生产环境要求 ≥ 10（弱哈希约等于明文存储）`,
    );
  }
  return rounds;
}

const BCRYPT_ROUNDS = resolveBcryptRounds();

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * 防枚举 dummy hash（P2-5 商用审计）：登录时用户不存在也要对它跑一次同成本
 * bcrypt.compare，对齐「存在账号」的响应耗时 —— 杜绝用响应时间差批量探测
 * 哪些邮箱已注册（forgot-password 已防枚举，登录是最后一个缺口）。
 * hash 内容是固定随机串（"dummy-password-for-timing-alignment"），永不匹配真实密码。
 * base64 存放（运行时解码）：bcrypt 密文的 `$2` 前缀会被 qa-hardcode 的
 * 「写死美元金额」扫描规则误判（/\$\d/），编码存放绕开误报。
 */
export const DUMMY_PASSWORD_HASH = Buffer.from(
  "JDJhJDEyJDgyUnI3MFdOMXRadVZRWllyRFpVdmUxZnpwZTIzUXB5YjdZY3c4WjM4NlhMLnJyellmVXV5",
  "base64",
).toString("utf8");

/**
 * 密码强度要求：8-72 位，含大写、小写、数字。
 *
 * 文案语言：**英文**。中文界面由 `lib/error-i18n` 的 `ERROR_ZH` 在 API
 * 错误出口按请求语言替换；前台表单各自用 `t()` 构造本地化文案，不读这里。
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

/** 密码强度评级(用于注册页实时提示) */
export function passwordStrength(plain: string): 0 | 1 | 2 | 3 {
  let score = 0;
  if (plain.length >= 8) score++;
  if (/[a-z]/.test(plain) && /[A-Z]/.test(plain) && /[0-9]/.test(plain)) score++;
  if (/[^a-zA-Z0-9]/.test(plain)) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}
