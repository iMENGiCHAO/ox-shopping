import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  passwordStrength,
  passwordSchema,
} from "@/lib/auth/password";

describe("密码哈希与强度", () => {
  it("bcrypt 哈希可验证", async () => {
    const hash = await hashPassword("User@123456");
    expect(hash).not.toContain("User@123456");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword("User@123456", hash)).toBe(true);
    expect(await verifyPassword("Wrong@123456", hash)).toBe(false);
  });

  it("同密码每次哈希不同（盐）", async () => {
    const [a, b] = await Promise.all([hashPassword("Same@123456"), hashPassword("Same@123456")]);
    expect(a).not.toBe(b);
  });

  it("强度评级", () => {
    expect(passwordStrength("abc")).toBe(0);
    expect(passwordStrength("abcdefgh")).toBe(1);
    expect(passwordStrength("Abcdef12")).toBe(2);
    expect(passwordStrength("Abcdef12!")).toBe(3);
  });

  it("zod 校验规则", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(false); // 无大写
    expect(passwordSchema.safeParse("ABCDEFGH").success).toBe(false); // 无小写
    expect(passwordSchema.safeParse("Abcdefgh").success).toBe(false); // 无数字
    expect(passwordSchema.safeParse("Abcdef12").success).toBe(true);
  });
});
