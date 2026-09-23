import { describe, expect, it } from "vitest";
import { DEFAULT_DISTRIBUTION_CONFIG, isDistributionEnabled } from "@/lib/distribution/contract";
import {
  isRuleActive,
  planClosureRows,
  planCommissions,
  resolveRatio,
  resolveRule,
  round2,
  summariseCommission,
  type CommissionRuleLike,
} from "@/lib/distribution/rules";
import {
  maskAccountInfo,
  maskEmail,
  maskName,
  maskPhone,
  maskRegion,
} from "@/lib/distribution/mask";
import {
  generateReferralCode,
  normalizeReferralInput,
  refCodeFromSearchParams,
  signRefCookie,
  verifyRefCookie,
} from "@/lib/distribution/referral";

/**
 * 分销模块**纯函数层**单测。
 *
 * 这些函数直接决定「钱算给谁、算多少、给谁看得到」，因此不依赖数据库也要能穷举：
 * 比例优先级、总比例封顶、自购、层级上限、闭包行、脱敏、推广码签名与防篡改。
 */

const rule = (
  scopeType: string,
  level: number,
  ratio: number,
  scopeId: string | null = null,
  enabled = true,
): CommissionRuleLike => ({ scopeType, scopeId, level, ratio, enabled });

const CFG = DEFAULT_DISTRIBUTION_CONFIG;

describe("佣金比例解析（scope 优先级）", () => {
  const rules: CommissionRuleLike[] = [
    rule("GLOBAL", 1, 10),
    rule("GLOBAL", 2, 5),
    rule("CATEGORY", 1, 12, "cat-1"),
    rule("PRODUCT", 1, 20, "prod-9"),
  ];

  it("PRODUCT > CATEGORY > GLOBAL", () => {
    expect(resolveRatio(rules, 1, { productIds: ["prod-9"], categoryIds: ["cat-1"] })).toBe(20);
    expect(resolveRatio(rules, 1, { categoryIds: ["cat-1"] })).toBe(12);
    expect(resolveRatio(rules, 1, {})).toBe(10);
  });

  it("未命中的层级返回 0，不抛错", () => {
    expect(resolveRatio(rules, 5, {})).toBe(0);
    expect(resolveRatio([], 1, {})).toBe(0);
  });

  it("禁用规则不生效", () => {
    expect(resolveRatio([rule("GLOBAL", 1, 10, null, false)], 1, {})).toBe(0);
  });

  it("scopeId 不匹配时不误命中", () => {
    expect(resolveRatio(rules, 1, { productIds: ["other"] })).toBe(10);
  });
});

describe("逐级佣金规划", () => {
  const rules: CommissionRuleLike[] = [
    rule("GLOBAL", 1, 10),
    rule("GLOBAL", 2, 5),
    rule("GLOBAL", 3, 2),
    rule("GLOBAL", 4, 1),
  ];
  const ancestors = [
    { userId: "A", depth: 1 },
    { userId: "X", depth: 2 },
    { userId: "Y", depth: 3 },
    { userId: "Z", depth: 4 },
  ];

  it("100 元基数按 10/5/2 逐级分佣", () => {
    const got = planCommissions({
      baseAmount: 100,
      ancestors,
      rules,
      config: { ...CFG, maxCommissionLevels: 3 },
      buyerId: "B",
    });
    expect(got).toEqual([
      { userId: "A", level: 1, ratio: 10, amount: 10 },
      { userId: "X", level: 2, ratio: 5, amount: 5 },
      { userId: "Y", level: 3, ratio: 2, amount: 2 },
    ]);
  });

  it("超出返佣层级只记录关系不返佣（第 4 级被截断）", () => {
    const got = planCommissions({
      baseAmount: 100,
      ancestors,
      rules,
      config: { ...CFG, maxCommissionLevels: 2 },
      buyerId: "B",
    });
    expect(got.map((g) => g.userId)).toEqual(["A", "X"]);
  });

  it("总比例封顶：会顶穿上限的那一层整体跳过（不截断金额）", () => {
    const got = planCommissions({
      baseAmount: 100,
      ancestors,
      rules,
      config: { ...CFG, maxCommissionLevels: 4, maxTotalRatio: 16 },
      buyerId: "B",
    });
    // 10 + 5 = 15 通过；+2 = 17 > 16 → 第三层整体跳过并停止
    expect(got.map((g) => g.level)).toEqual([1, 2]);
    expect(got.reduce((s, g) => s + g.ratio, 0)).toBe(15);
  });

  it("自购默认不给自己佣金，但上级照常分佣", () => {
    const got = planCommissions({
      baseAmount: 100,
      ancestors,
      rules,
      config: { ...CFG, maxCommissionLevels: 3 },
      buyerId: "A", // A 就是归属分销商本人
    });
    expect(got.map((g) => g.userId)).toEqual(["X", "Y"]);
  });

  it("开启自购佣金后本人也拿（合规上可关，默认关）", () => {
    const got = planCommissions({
      baseAmount: 100,
      ancestors,
      rules,
      config: {
        ...CFG,
        maxCommissionLevels: 3,
        selfPurchaseCommission: true,
        selfPurchaseCountForUpstream: true,
      },
      buyerId: "A",
    });
    expect(got.map((g) => g.userId)).toEqual(["A", "X", "Y"]);
  });

  it("金额不足 1 分不产生流水", () => {
    const got = planCommissions({
      baseAmount: 1,
      ancestors,
      rules,
      config: { ...CFG, maxCommissionLevels: 3 },
      buyerId: "B",
    });
    // 1 * 2% = 0.02 → 保留；1 * 1% = 0.01 → 边界保留；这里只验 3 级上限
    expect(got.every((g) => g.amount >= 0.01)).toBe(true);
    const tiny = planCommissions({
      baseAmount: 0.05,
      ancestors: [{ userId: "A", depth: 3 }],
      rules,
      config: { ...CFG, maxCommissionLevels: 3 },
      buyerId: "B",
    });
    expect(tiny).toEqual([]); // 0.05 * 2% = 0.001 → 舍弃
  });

  it("基数非法（0/负/NaN）返回空", () => {
    for (const base of [0, -100, Number.NaN]) {
      expect(
        planCommissions({ baseAmount: base, ancestors, rules, config: CFG, buyerId: "B" }),
      ).toEqual([]);
    }
  });

  it("比例合计精确到分（无浮点尾数）", () => {
    const got = planCommissions({
      baseAmount: 199.99,
      ancestors: [{ userId: "A", depth: 1 }],
      rules: [rule("GLOBAL", 1, 3.33)],
      config: CFG,
      buyerId: "B",
    });
    expect(got[0]!.amount).toBe(6.66); // 199.99*3.33% = 6.659667 → 6.66
    expect(round2(got[0]!.amount)).toBe(6.66);
  });
});

describe("闭包表行规划", () => {
  it("自己 + 直接上级 + 上级的全部祖先（depth 递增）", () => {
    const rows = planClosureRows("D", "U", [
      { userId: "U", depth: 0 },
      { userId: "P", depth: 1 },
      { userId: "G", depth: 2 },
    ]);
    expect(rows).toEqual([
      { ancestorId: "D", descendantId: "D", depth: 0 },
      { ancestorId: "U", descendantId: "D", depth: 1 },
      { ancestorId: "P", descendantId: "D", depth: 2 },
      { ancestorId: "G", descendantId: "D", depth: 3 },
    ]);
  });

  it("自然流量（无上级）只有自己那一行", () => {
    expect(planClosureRows("D", null, [])).toEqual([
      { ancestorId: "D", descendantId: "D", depth: 0 },
    ]);
  });

  it("不产生自环", () => {
    const rows = planClosureRows("D", "D", [{ userId: "D", depth: 0 }]);
    expect(rows.filter((r) => r.ancestorId === r.descendantId)).toHaveLength(1);
  });
});

describe("佣金汇总口径", () => {
  it("在途/已结算/已冲正分开统计", () => {
    expect(
      summariseCommission([
        { status: "PENDING", amountCny: 10 },
        { status: "PENDING", amountCny: 5.5 },
        { status: "SETTLED", amountCny: 20 },
        { status: "REVERSED", amountCny: -20 },
      ]),
    ).toEqual({ pending: 15.5, settled: 20, reversed: -20 });
  });

  it("部分冲正按净额统计：摘要不得大于实际入账（P1 回归）", () => {
    // 部分退款后流水仍是 SETTLED/PENDING，只有 reversedCny 记录已冲正额。
    // 修复前摘要按原始 amountCny 累加，会出现「已结算佣金 > 余额」的矛盾。
    expect(
      summariseCommission([
        { status: "SETTLED", amountCny: 100, reversedCny: 40 },
        { status: "PENDING", amountCny: 50, reversedCny: 10 },
        { status: "REVERSED", amountCny: 30, reversedCny: 30 },
      ]),
    ).toEqual({ pending: 40, settled: 60, reversed: 30 });
  });

  it("冲正额超过原始额时不产生负收入（数据异常兜底）", () => {
    expect(summariseCommission([{ status: "SETTLED", amountCny: 10, reversedCny: 25 }])).toEqual({
      pending: 0,
      settled: 0,
      reversed: 0,
    });
  });
});

describe("敏感信息脱敏", () => {
  it("手机号保留前 3 后 4", () => {
    expect(maskPhone("13812341234")).toBe("138****1234");
    expect(maskPhone("138-1234-1234")).toBe("138****1234");
    expect(maskPhone("123")).toBe("***");
    expect(maskPhone(null)).toBe("");
  });

  it("邮箱只留首字符与域名", () => {
    expect(maskEmail("zhangsan@example.com")).toBe("z***@example.com");
    expect(maskEmail("bad")).toBe("***");
  });

  it("姓名只留姓", () => {
    expect(maskName("张三")).toBe("张**");
    expect(maskName("A")).toBe("A");
  });

  it("地址只返回省市", () => {
    expect(
      maskRegion({
        recipientName: "张三",
        phone: "13812341234",
        province: "广东省",
        city: "深圳市",
        district: "南山区",
        detail: "科技园 1 号",
      }),
    ).toBe("广东省 深圳市");
    expect(maskRegion(null)).toBe("");
  });

  it("收款账户只留尾 4 位", () => {
    expect(maskAccountInfo("6222021234567890123")).toBe("****0123");
    expect(maskAccountInfo("12")).toBe("****");
  });
});

describe("推广码与签名 cookie", () => {
  it("推广码长度固定、字符集不含易混淆字符", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
      expect(code).not.toMatch(/[0O1Ilo]/);
    }
  });

  it("推广码不重复（500 次抽样）", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateReferralCode()));
    expect(seen.size).toBe(500);
  });

  it("签名 cookie 往返一致", () => {
    const signed = signRefCookie("ABCD2345");
    const got = verifyRefCookie(signed, 1000 * 60);
    expect(got?.code).toBe("ABCD2345");
  });

  it("篡改 cookie（改码/改签名/改时间）一律失效", () => {
    const signed = signRefCookie("ABCD2345");
    const [code, ts, sig] = signed.split(".") as [string, string, string];
    expect(verifyRefCookie(`XXXX${code.slice(4)}.${ts}.${sig}`, 1e9)).toBeNull();
    expect(verifyRefCookie(`${code}.${ts}.AAAA`, 1e9)).toBeNull();
    expect(verifyRefCookie(`${code}.${Number(ts) + 1}.${sig}`, 1e9)).toBeNull();
    expect(verifyRefCookie("garbage", 1e9)).toBeNull();
    expect(verifyRefCookie(null, 1e9)).toBeNull();
  });

  it("过期 cookie 失效", () => {
    const signed = signRefCookie("ABCD2345", Date.now() - 60_000);
    expect(verifyRefCookie(signed, 30_000)).toBeNull();
  });

  it("输入规范化：大小写/空白/连字符", () => {
    expect(normalizeReferralInput(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizeReferralInput("ab")).toBeNull();
    expect(normalizeReferralInput(null)).toBeNull();
  });

  it("三种推广参数形态都能解析", () => {
    expect(refCodeFromSearchParams([["ref", "ABCD2345"]])).toBe("ABCD2345");
    expect(refCodeFromSearchParams([["distributor_id", "abcd2345"]])).toBe("ABCD2345");
    expect(refCodeFromSearchParams([["invite", "ABCD-2345"]])).toBe("ABCD2345");
    expect(refCodeFromSearchParams([["other", "XYZ"]]), "无关参数不解析").toBeNull();
  });
});

describe("模块开关与默认配置", () => {
  it("默认开启；显式 false 才关闭（不改 env 则商城行为不变）", () => {
    const prev = process.env.DISTRIBUTION_ENABLED;
    delete process.env.DISTRIBUTION_ENABLED;
    expect(isDistributionEnabled()).toBe(true);
    process.env.DISTRIBUTION_ENABLED = "false";
    expect(isDistributionEnabled()).toBe(false);
    process.env.DISTRIBUTION_ENABLED = "true";
    expect(isDistributionEnabled()).toBe(true);
    if (prev === undefined) delete process.env.DISTRIBUTION_ENABLED;
    else process.env.DISTRIBUTION_ENABLED = prev;
  });

  it("默认口径符合合规建议（三级、不可抢绑、自购不返自己、总比例封顶）", () => {
    expect(DEFAULT_DISTRIBUTION_CONFIG.maxCommissionLevels).toBe(3);
    expect(DEFAULT_DISTRIBUTION_CONFIG.allowRebind).toBe(false);
    expect(DEFAULT_DISTRIBUTION_CONFIG.selfPurchaseCommission).toBe(false);
    expect(DEFAULT_DISTRIBUTION_CONFIG.selfPurchaseCountForUpstream).toBe(true);
    expect(DEFAULT_DISTRIBUTION_CONFIG.maxTotalRatio).toBe(30);
    expect(DEFAULT_DISTRIBUTION_CONFIG.bindExpireDays).toBe(0);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * P1-9 佣金规则：固定金额（FIXED）与生效期（effectiveAt/expireAt）
 * ──────────────────────────────────────────────────────────────────────── */

const BASE_CONFIG = {
  maxCommissionLevels: 3,
  maxTotalRatio: 30,
  selfPurchaseCommission: false,
  selfPurchaseCountForUpstream: true,
};

const ancestors = [
  { userId: "u1", depth: 1 },
  { userId: "u2", depth: 2 },
  { userId: "u3", depth: 3 },
];

describe("佣金规则：固定金额（FIXED）", () => {
  it("按每单固定金额给一级佣金，不再按比例计算", () => {
    const rules = [
      {
        scopeType: "GLOBAL",
        scopeId: "",
        level: 1,
        mode: "FIXED",
        ratio: 0,
        fixedAmount: 5,
        enabled: true,
      },
    ];
    const planned = planCommissions({
      baseAmount: 100,
      ancestors: [{ userId: "u1", depth: 1 }],
      rules,
      config: BASE_CONFIG,
    });
    expect(planned).toHaveLength(1);
    expect(planned[0]!.amount).toBe(5); // 固定 5，而不是 100 × 10%
    expect(planned[0]!.ratio).toBe(0);
  });

  it("固定金额同样受总比例上限约束（防小额订单返穿毛利）", () => {
    // 基数 10、上限 30% → 最多 3；固定 5 会超限，应当整层跳过
    const rules = [
      {
        scopeType: "GLOBAL",
        scopeId: "",
        level: 1,
        mode: "FIXED",
        ratio: 0,
        fixedAmount: 5,
        enabled: true,
      },
    ];
    const planned = planCommissions({
      baseAmount: 10,
      ancestors: [{ userId: "u1", depth: 1 }],
      rules,
      config: BASE_CONFIG,
    });
    expect(planned).toEqual([]);
  });

  it("固定金额与比例规则可混用（逐级各自取自己的口径）", () => {
    const rules = [
      {
        scopeType: "GLOBAL",
        scopeId: "",
        level: 1,
        mode: "FIXED",
        ratio: 0,
        fixedAmount: 3,
        enabled: true,
      },
      { scopeType: "GLOBAL", scopeId: "", level: 2, mode: "RATIO", ratio: 5, enabled: true },
    ];
    const planned = planCommissions({
      baseAmount: 100,
      ancestors,
      rules,
      config: BASE_CONFIG,
    });
    expect(planned.map((p) => [p.level, p.amount])).toEqual([
      [1, 3],
      [2, 5],
    ]);
  });

  it("固定金额为 0 / 负数视为无效规则（不产生流水）", () => {
    const rules = [
      {
        scopeType: "GLOBAL",
        scopeId: "",
        level: 1,
        mode: "FIXED",
        ratio: 0,
        fixedAmount: 0,
        enabled: true,
      },
    ];
    expect(
      planCommissions({
        baseAmount: 100,
        ancestors: [{ userId: "u1", depth: 1 }],
        rules,
        config: BASE_CONFIG,
      }),
    ).toEqual([]);
  });
});

describe("佣金规则：生效期", () => {
  const rule = {
    scopeType: "GLOBAL",
    scopeId: "",
    level: 1,
    mode: "RATIO",
    ratio: 10,
    enabled: true,
    effectiveAt: "2026-01-01T00:00:00.000Z",
    expireAt: "2026-02-01T00:00:00.000Z",
  };

  it("生效期之前不参与计算", () => {
    expect(resolveRule([rule], 1, {}, new Date("2025-12-31T23:59:59.000Z"))).toBeNull();
  });

  it("生效期内正常命中", () => {
    const hit = resolveRule([rule], 1, {}, new Date("2026-01-15T00:00:00.000Z"));
    expect(hit).toEqual({ mode: "RATIO", ratio: 10, fixedAmount: 0 });
  });

  it("到期即失效（边界：expireAt 当刻算失效）", () => {
    expect(resolveRule([rule], 1, {}, new Date("2026-02-01T00:00:00.000Z"))).toBeNull();
  });

  it("未填生效期 = 立即生效且长期有效", () => {
    const open = {
      scopeType: "GLOBAL",
      scopeId: "",
      level: 2,
      mode: "RATIO",
      ratio: 5,
      enabled: true,
    };
    expect(resolveRule([open], 2, {}, new Date("2099-01-01T00:00:00.000Z"))).toEqual({
      mode: "RATIO",
      ratio: 5,
      fixedAmount: 0,
    });
  });

  it("生效期与启停叠加：停用的规则即使处在生效期也不参与", () => {
    const disabled = { ...rule, enabled: false };
    expect(resolveRule([disabled], 1, {}, new Date("2026-01-15T00:00:00.000Z"))).toBeNull();
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * P2-15 分销商等级：等级专用规则覆盖通用规则，且**逐级各取自己的等级**
 * ──────────────────────────────────────────────────────────────────────── */

describe("分销商等级（tier）", () => {
  const generic = {
    scopeType: "GLOBAL",
    scopeId: "",
    level: 1,
    mode: "RATIO",
    ratio: 5,
    enabled: true,
  };
  const vip = {
    scopeType: "GLOBAL",
    scopeId: "",
    level: 1,
    mode: "RATIO",
    ratio: 12,
    tierLevel: 2,
    enabled: true,
  };

  it("等级专用规则覆盖通用规则", () => {
    expect(resolveRule([generic, vip], 1, { tier: 2 })?.ratio).toBe(12);
  });

  it("非该等级的分销商回落到通用规则", () => {
    expect(resolveRule([generic, vip], 1, { tier: 0 })?.ratio).toBe(5);
    expect(resolveRule([generic, vip], 1, { tier: 1 })?.ratio).toBe(5);
  });

  it("只有等级专用规则、但等级不匹配 → 不返佣（不是错误地按专用比例给）", () => {
    expect(resolveRule([vip], 1, { tier: 0 })).toBeNull();
    expect(resolveRule([vip], 1, { tier: 2 })?.ratio).toBe(12);
  });

  it("tierLevel=0 视为通用规则（等价于不区分等级）", () => {
    const zero = { ...generic, ratio: 7, tierLevel: 0 };
    const other = { ...generic, ratio: 9 };
    expect(resolveRule([zero, other], 1, { tier: 0 })?.ratio).toBe(7);
    expect(resolveRule([zero, other], 1, { tier: 3 })?.ratio).toBe(7);
  });

  it("逐级各取自己的等级：一级高等级、二级普通", () => {
    const rules = [
      generic, // 一级通用 5%
      vip, // 一级 VIP(2) 12%
      { scopeType: "GLOBAL", scopeId: "", level: 2, mode: "RATIO", ratio: 3, enabled: true },
    ];
    const planned = planCommissions({
      baseAmount: 1000,
      ancestors: [
        { userId: "vipUser", depth: 1, tier: 2 },
        { userId: "normalUser", depth: 2, tier: 0 },
      ],
      rules,
      config: BASE_CONFIG,
    });
    expect(planned.map((p) => [p.level, p.amount])).toEqual([
      [1, 120], // 12% × 1000
      [2, 30], // 3% × 1000
    ]);
  });
});
