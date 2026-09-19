import { describe, expect, it } from "vitest";
import { registerSchema, loginSchema } from "@/lib/validations/auth";
import { addressSchema } from "@/lib/validations/address";
import { orderCreateSchema } from "@/lib/validations/cart-order";
import { productCreateSchema, categoryCreateSchema } from "@/lib/validations/product";

describe("注册校验", () => {
  it("合法输入通过", () => {
    const r = registerSchema.safeParse({
      email: " Test@Example.COM ",
      name: "张三",
      password: "Abcdef12",
    });
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe("test@example.com"); // trim + 小写
  });

  it("弱密码拒绝", () => {
    expect(
      registerSchema.safeParse({ email: "a@b.com", name: "张三", password: "abc" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ email: "a@b.com", name: "张三", password: "abcdefgh" }).success,
    ).toBe(false);
  });

  it("非法邮箱拒绝", () => {
    expect(
      registerSchema.safeParse({ email: "not-an-email", name: "张三", password: "Abcdef12" })
        .success,
    ).toBe(false);
  });
});

describe("登录校验", () => {
  it("邮箱自动 trim 小写", () => {
    const r = loginSchema.safeParse({ email: " USER@Example.com ", password: "Abcdef12" });
    expect(r.data?.email).toBe("user@example.com");
  });
});

describe("地址校验", () => {
  it("合法地址通过", () => {
    const r = addressSchema.safeParse({
      recipientName: "张三",
      phone: "13800138000",
      province: "广东省",
      city: "深圳市",
      district: "南山区",
      detail: "科技园南路 1 号",
    });
    expect(r.success).toBe(true);
    expect(r.data?.isDefault).toBe(false); // 默认值
  });

  it("手机号：明显非法拒绝、国际格式接受", () => {
    const base = {
      recipientName: "张三",
      province: "广东省",
      city: "深圳市",
      district: "南山区",
      detail: "科技园南路 1 号",
    };
    // 明显非法：过短（<6 位）/ 含字母
    expect(addressSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, phone: "abc123456" }).success).toBe(false);
    // 国际号码格式应接受（本站默认面向欧美客户，不能只认中国手机号）
    expect(addressSchema.safeParse({ ...base, phone: "23800138000" }).success).toBe(true);
    expect(addressSchema.safeParse({ ...base, phone: "+1 (415) 555-0132" }).success).toBe(true);
  });
});

describe("订单创建校验", () => {
  it("购物车不能为空", () => {
    const r = orderCreateSchema.safeParse({
      items: [],
      addressId: "addr1",
    });
    expect(r.success).toBe(false);
  });

  it("数量超限拒绝", () => {
    const r = orderCreateSchema.safeParse({
      items: [{ productId: "p1", quantity: 999 }],
      addressId: "addr1",
    });
    expect(r.success).toBe(false);
  });

  it("合法订单通过", () => {
    const r = orderCreateSchema.safeParse({
      items: [{ productId: "p1", quantity: 2 }],
      addressId: "addr1",
      shippingMethod: "express",
    });
    expect(r.success).toBe(true);
    expect(r.data?.shippingMethod).toBe("express");
  });
});

describe("商品校验（管理端）", () => {
  it("价格必须为正", () => {
    const base = {
      name: "测试商品",
      sku: "SKU-001",
      price: 0,
      stock: 10,
      categoryId: "c1",
    };
    expect(productCreateSchema.safeParse(base).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...base, price: 99.9 }).success).toBe(true);
  });

  it("slug 格式校验", () => {
    expect(categoryCreateSchema.safeParse({ name: "手机", slug: "Bad Slug" }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: "手机", slug: "phones" }).success).toBe(true);
  });
});

describe("注册蜜罐字段（防脚本灌水）", () => {
  it("未携带/空串 company 正常通过（人类路径）", () => {
    const ok = registerSchema.safeParse({
      email: "user@example.com",
      name: "张三",
      password: "Abcdef12",
    });
    expect(ok.success).toBe(true);
    const okEmpty = registerSchema.safeParse({
      email: "user@example.com",
      name: "张三",
      password: "Abcdef12",
      company: "",
    });
    expect(okEmpty.success).toBe(true);
  });

  it("机器人填了 company 也能通过 schema（由 route 层静默拦截，不暴露蜜罐语义）", () => {
    // schema 层只做长度卫生；route 层对非空值统一 400
    const bot = registerSchema.safeParse({
      email: "bot@example.com",
      name: "机器人",
      password: "Abcdef12",
      company: "spam-inc",
    });
    expect(bot.success).toBe(true);
    expect((bot.data as Record<string, unknown>).company).toBe("spam-inc");
  });

  it("超长 company 值被 schema 卫生拦截", () => {
    const evil = registerSchema.safeParse({
      email: "bot@example.com",
      name: "机器人",
      password: "Abcdef12",
      company: "x".repeat(201),
    });
    expect(evil.success).toBe(false);
  });
});
