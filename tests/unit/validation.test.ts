import { describe, expect, it } from "vitest";
import { registerSchema, loginSchema } from "@/lib/validations/auth";
import { addressSchema } from "@/lib/validations/address";
import {
  orderCreateSchema,
  couponApplySchema,
  couponCreateSchema,
  reviewCreateSchema,
} from "@/lib/validations/cart-order";
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

  it("非法手机号拒绝", () => {
    const base = {
      recipientName: "张三",
      province: "广东省",
      city: "深圳市",
      district: "南山区",
      detail: "科技园南路 1 号",
    };
    expect(addressSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, phone: "23800138000" }).success).toBe(false);
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
      couponCode: "SAVE50",
      shippingMethod: "express",
    });
    expect(r.success).toBe(true);
    expect(r.data?.shippingMethod).toBe("express");
  });
});

describe("评价校验", () => {
  it("评分范围 1-5", () => {
    expect(reviewCreateSchema.safeParse({ rating: 0, comment: "好极了！" }).success).toBe(false);
    expect(reviewCreateSchema.safeParse({ rating: 6, comment: "好极了！" }).success).toBe(false);
    expect(reviewCreateSchema.safeParse({ rating: 5, comment: "商品很好用！" }).success).toBe(true);
  });

  it("评论长度限制", () => {
    expect(reviewCreateSchema.safeParse({ rating: 5, comment: "短" }).success).toBe(false);
  });
});

describe("优惠券", () => {
  it("优惠码字符集限制（管理端创建）", () => {
    const base = {
      type: "FIXED",
      value: 50,
      minSpend: 300,
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
    };
    expect(couponApplySchema.safeParse({ code: "OK", subtotal: 100 }).success).toBe(true);
    expect(couponCreateSchema.safeParse({ ...base, code: "SAVE99" }).success).toBe(true);
    expect(couponCreateSchema.safeParse({ ...base, code: "非法字符" }).success).toBe(false);
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
