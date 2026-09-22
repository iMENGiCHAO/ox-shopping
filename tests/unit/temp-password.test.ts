import { describe, expect, it } from "vitest";
import {
  TEMP_PASSWORD_ALPHABET,
  TEMP_PASSWORD_LENGTH,
  generateTempPassword,
} from "@/lib/auth/temp-password";
import { passwordSchema } from "@/lib/auth/password";

/**
 * B-2 临时密码生成规则。
 *
 * 这些断言守护的是一条**业务闭环**：临时密码会通过邮件发给用户，用户必须
 * 能用它完成强制改密。任何一条不满足都会变成线上事故：
 *   - 缺数字/大写/小写 → 改密页（沿用 passwordSchema）直接拒收；
 *   - 长度不足或超 72 → 同上；
 *   - 含易混淆字符 → 用户反复输错，客服被打爆；
 *   - 随机源弱 → 可预测，等于没设密码。
 */
describe("临时密码生成（B-2）", () => {
  it("默认 14 位，且必然满足服务端密码强度校验", () => {
    for (let i = 0; i < 50; i++) {
      const pwd = generateTempPassword();
      expect(pwd).toHaveLength(TEMP_PASSWORD_LENGTH);
      // passwordSchema 是注册/改密共用的唯一强度口径，必须能原样通过
      expect(passwordSchema.safeParse(pwd).success).toBe(true);
    }
  });

  it("必然同时包含大写、小写、数字与符号", () => {
    for (let i = 0; i < 100; i++) {
      const pwd = generateTempPassword();
      expect(/[A-Z]/.test(pwd)).toBe(true);
      expect(/[a-z]/.test(pwd)).toBe(true);
      expect(/[0-9]/.test(pwd)).toBe(true);
      expect(/[!@#$%^&*]/.test(pwd)).toBe(true);
    }
  });

  it("不含易混淆字符（0 O 1 l I）", () => {
    for (let i = 0; i < 200; i++) {
      const pwd = generateTempPassword();
      expect(pwd).not.toMatch(/[0O1lI]/);
    }
  });

  it("每个字符都来自声明字符表（无隐藏字符/空白）", () => {
    for (let i = 0; i < 50; i++) {
      const pwd = generateTempPassword();
      for (const ch of pwd) {
        expect(TEMP_PASSWORD_ALPHABET).toContain(ch);
      }
      expect(pwd).toBe(pwd.trim());
    }
  });

  it("随机性：200 次生成无重复", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateTempPassword());
    expect(seen.size).toBe(200);
  });

  it("自定义长度同样满足强度校验", () => {
    for (const len of [8, 10, 24]) {
      const pwd = generateTempPassword(len);
      expect(pwd).toHaveLength(len);
      expect(passwordSchema.safeParse(pwd).success).toBe(true);
    }
  });
});
