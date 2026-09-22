import "server-only";
import { randomInt } from "node:crypto";

/**
 * 临时密码生成（B-2 找回密码人工审批流的下发凭证）。
 *
 * 单独成模块的原因：它是**纯函数式的密码学工具**，不该和「审批流数据库读写」
 * 绑在一个文件里 —— 单测可以直接覆盖生成规则（字符集、强度、无混淆字符、
 * 碰撞概率），无需拉起 Prisma / 邮件 / 会话模块。
 *
 * 字符表刻意剔除易混淆字符（0/O、1/l/I）：临时密码要靠用户手抄、眼读，
 * 混淆字符会把「强随机」变成「天天找客服」。
 */
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** 14 位取自 ~57 字符表 ≈ 81 bit 熵，远超 bcrypt 暴力破解的经济性边界 */
export const TEMP_PASSWORD_LENGTH = 14;

/** 供测试断言「不含易混淆字符」用的完整字符表 */
export const TEMP_PASSWORD_ALPHABET = ALL;

/**
 * 生成临时密码。
 *
 * 用 `crypto.randomInt`（CSPRNG + 拒绝采样）而非 `Math.random` / `% 字符表长度`：
 *   - `Math.random` 不是密码学安全随机源；
 *   - 取模会引入偏置（长度不整除时低位字符概率更高）。
 *
 * 先各取一枚大写/小写/数字/符号再洗牌：保证**必然**通过 `passwordSchema`
 * 的强度校验（否则会给用户发一个改密页拒收的密码），同时避免固定前几位。
 */
export function generateTempPassword(length: number = TEMP_PASSWORD_LENGTH): string {
  const pick = (alphabet: string) => alphabet.charAt(randomInt(0, alphabet.length));
  const chars: string[] = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher–Yates（洗牌随机源同样用 randomInt，不用 Math.random）
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join("");
}
