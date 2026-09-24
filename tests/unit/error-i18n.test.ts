import { describe, expect, it } from "vitest";
import { localizeErrorMessage, localizeErrorDetails } from "@/lib/error-i18n";
import { isAdminApiPath, langForApiRequest, langFromCookies } from "@/lib/request-lang";

/**
 * 错误文案本地化（精确表 + 模式表）与**请求语言推断**的回归测试。
 *
 * 为什么这两件事放一起：它们是同一条链路的两个环节 ——
 * `request-lang` 决定「该用哪种语言」，`error-i18n` 负责「翻译成那种语言」。
 * 任一环错位，表现都是「英文站漏出中文」或「中文站漏出英文」。
 *
 * 覆盖的真实缺陷（都曾发生过）：
 *   1. 服务端错误源串是中文 → 英文站顾客收到中文（ERROR_ZH 只做英→中，不做中→英）
 *   2. 带插值的文案（`Option "Size" …`）永远命中不了精确表 → 中文站一直显示英文
 *   3. 后台是中文产品，但其 API 错误语言却按**店面**的 shop-lang 推断
 *      → 店主把店面切成英文后，中文后台开始报英文错误
 */

describe("错误文案本地化 · 精确表", () => {
  const cases: Array<[string, string, string]> = [
    ["Please sign in first", "请先登录", "通用默认"],
    ["Your session has expired, please sign in again", "登录已过期，请重新登录", "会话过期"],
    ["Suspicious sign-in detected, please sign in again", "检测到异常登录，请重新登录", "重放检测"],
    ["This account has been disabled", "该账号已被禁用", "账号禁用"],
    ["Product not found or no longer available", "商品不存在或已下架", "商品"],
    ["Address not found", "地址不存在", "地址"],
    // 订单状态机与鉴权（顾客可见）
    [
      "Paid orders must go through the refund flow instead of being cancelled",
      "已支付订单请走退款流程，不能直接取消",
      "订单：已支付不可取消",
    ],
    [
      "Carrier is required when marking an order as shipped",
      "发货时必须填写物流公司",
      "发货：物流公司",
    ],
    [
      "Tracking number is required when marking an order as shipped",
      "发货时必须填写物流单号",
      "发货：物流单号",
    ],
    [
      "Order status has changed, please refresh and try again",
      "订单状态已变更，请刷新后重试",
      "并发状态变更",
    ],
    ["You don't have access to this order", "无权访问该订单", "订单鉴权 403"],
    [
      "Order has already been fully refunded or reserved",
      "订单已全额退款或已有退款处理中，无法再次退款",
      "退款：已全额退款或在途",
    ],
  ];

  for (const [en, wantZh, label] of cases) {
    it(`${label}：zh 译为中文，en 原样返回`, () => {
      expect(localizeErrorMessage(en, "zh")).toBe(wantZh);
      // 英文站必须原样返回英文 —— 这是「英文站不漏中文」的最后一道闸
      expect(localizeErrorMessage(en, "en")).toBe(en);
    });
  }
});

describe("错误文案本地化 · 模式表（带插值）", () => {
  const cases: Array<[string, string, string]> = [
    [
      'Option "Size" is not available for this product',
      "规格「Size」不是该商品的可选规格",
      "规格名",
    ],
    ['Option "Size" value "XXL" is invalid', "规格「Size」的值「XXL」无效", "规格名+值"],
    ["Not enough stock — only 3 left", "库存不足，当前仅剩 3 件", "库存"],
    [
      "Your Shopping Bag can hold at most 50 different items",
      "Shopping Bag 最多 50 种商品",
      "购物袋上限",
    ],
    [
      'Cannot change order status from "PAID" to "PENDING_PAYMENT"',
      "不允许从「PAID」变更为「PENDING_PAYMENT」",
      "状态机：非法流转",
    ],
    [
      'Order in status "CANCELLED" cannot be marked as refunded directly',
      "当前状态「CANCELLED」不可直接置为已退款",
      "退款：状态不符（directly）",
    ],
    [
      'Order in status "PENDING_PAYMENT" cannot be marked as refunded',
      "当前状态「PENDING_PAYMENT」不可标记为已退款",
      "退款：状态不符",
    ],
    [
      '"The Core Tee" variant Size:L is out of stock — only 2 left',
      "「The Core Tee」的规格 Size:L 已售罄 — 仅剩 2 件",
      "规格售罄",
    ],
    [
      '"The Core Tee" is out of stock — only 0 left',
      "「The Core Tee」已售罄 — 仅剩 0 件",
      "商品售罄",
    ],
  ];

  for (const [en, wantZh, label] of cases) {
    it(`${label}：插值后仍能命中模式`, () => {
      expect(localizeErrorMessage(en, "zh")).toBe(wantZh);
      expect(localizeErrorMessage(en, "en")).toBe(en);
    });
  }

  it("规则顺序：带 directly 的规则先于更宽的规则匹配（否则会被吃掉）", () => {
    // 若两条规则的顺序反了，这里会得到「不可标记为已退款」而丢掉「直接」
    expect(
      localizeErrorMessage('Order in status "X" cannot be marked as refunded directly', "zh"),
    ).toBe("当前状态「X」不可直接置为已退款");
  });
});

describe("错误文案本地化 · 兜底", () => {
  it("未命中的文案原样返回（不崩、不乱翻）", () => {
    const unknown = "Some brand new server message";
    expect(localizeErrorMessage(unknown, "zh")).toBe(unknown);
    expect(localizeErrorMessage(unknown, "en")).toBe(unknown);
    // 未知语言同样原样返回
    expect(localizeErrorMessage(unknown, "fr")).toBe(unknown);
  });

  it("中文文案本身不会被再翻译一次（幂等，防重复本地化）", () => {
    const zh = "无权访问该订单";
    expect(localizeErrorMessage(zh, "zh")).toBe(zh);
  });

  it("字段级 details 也本地化；非字符串 message 原样保留", () => {
    const details = localizeErrorDetails(
      [
        { path: "email", message: "Invalid email format" },
        { path: "x", message: 42 },
      ],
      "zh",
    ) as Array<{ message: unknown }>;
    expect(details[0]?.message).toBe("邮箱格式不正确");
    expect(details[1]?.message).toBe(42);
  });

  it("details 结构不符时原样返回（向后兼容）", () => {
    expect(localizeErrorDetails(null, "zh")).toBeNull();
    expect(localizeErrorDetails("oops", "zh")).toBe("oops");
    // 英文站不改写 details
    const raw = [{ message: "Invalid email format" }];
    expect(localizeErrorDetails(raw, "en")).toEqual(raw);
  });
});

describe("请求语言推断", () => {
  /** 造一个最小的 cookie 读取器 */
  const jar = (cookies: Record<string, string>) => (name: string) => cookies[name];

  it("币种优先：CNY → 中文，其他币种 → 英文（即使 shop-lang=zh）", () => {
    expect(langFromCookies(jar({ currency: "CNY" }))).toBe("zh");
    expect(langFromCookies(jar({ currency: "USD" }))).toBe("en");
    // 币种优先于 shop-lang：选了 USD 就该是英文
    expect(langFromCookies(jar({ currency: "USD", "shop-lang": "zh" }))).toBe("en");
  });

  it("无币种时看 shop-lang，都没有则默认英文（英文是站点默认语言）", () => {
    expect(langFromCookies(jar({ "shop-lang": "zh" }))).toBe("zh");
    expect(langFromCookies(jar({ "shop-lang": "en" }))).toBe("en");
    expect(langFromCookies(jar({}))).toBe("en");
  });

  it("isAdminApiPath 只认 /api/admin/* 前缀", () => {
    expect(isAdminApiPath("/api/admin/orders")).toBe(true);
    expect(isAdminApiPath("/api/admin/")).toBe(true);
    // 前缀相似但非后台的路径不能被误判
    expect(isAdminApiPath("/api/administrator")).toBe(false);
    expect(isAdminApiPath("/api/orders")).toBe(false);
    expect(isAdminApiPath("/api/products?category=admin")).toBe(false);
  });

  it("后台 API 恒为中文，不受店面 shop-lang / 币种影响", () => {
    const req = (url: string, cookies: Record<string, string>) => ({
      url,
      cookies: {
        get: (n: string) => (cookies[n] === undefined ? undefined : { value: cookies[n]! }),
      },
    });
    // 店主把店面切成英文 —— 中文后台不该跟着变成英文
    expect(langForApiRequest(req("http://t.local/api/admin/orders", { currency: "USD" }))).toBe(
      "zh",
    );
    expect(langForApiRequest(req("http://t.local/api/admin/orders", { "shop-lang": "en" }))).toBe(
      "zh",
    );
    // 店面请求照旧按 cookie 推断
    expect(langForApiRequest(req("http://t.local/api/orders", { currency: "CNY" }))).toBe("zh");
    expect(langForApiRequest(req("http://t.local/api/orders", { currency: "USD" }))).toBe("en");
  });

  it("URL 非法时按店面处理，不抛异常", () => {
    const req = { url: "not-a-url", cookies: { get: () => undefined } };
    expect(langForApiRequest(req)).toBe("en");
  });
});
