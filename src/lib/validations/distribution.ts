import { z } from "zod";

/**
 * 分销模块入参校验（英文文案 + error-i18n 本地化，与全站约定一致）。
 */

/** 手动绑定（推广码绑定客户） */
export const distributionBindSchema = z.object({
  code: z.string().trim().min(4).max(32),
  bindType: z.enum(["link", "qrcode", "code"]).optional(),
  source: z.string().trim().max(120).optional(),
});

/** 提现申请 */
export const withdrawApplySchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
  accountInfo: z.string().trim().max(200).optional(),
  remark: z.string().trim().max(200).optional(),
  /**
   * KYC/打款信息：一期线下打款必须能核对到人，
   * 因此收款人实名与收款方式为**必填**（只在已填写过时可省略，服务端会沿用历史值）。
   */
  payeeName: z.string().trim().min(2).max(64).optional(),
  payeeMethod: z.enum(["bank", "alipay", "wechat", "other"]).optional(),
  /** 必须显式确认《分销规则》（合规留痕，服务端记 termsAcceptedAt） */
  acceptTerms: z.literal(true),
});

/** 平台审核提现 */
export const withdrawAuditSchema = z.object({
  action: z.enum(["approve", "paid", "reject"]),
  note: z.string().trim().max(300).optional(),
  payNote: z.string().trim().max(120).optional(),
});

/** 佣金规则（新增/修改） */
export const commissionRuleSchema = z
  .object({
    scopeType: z.enum(["GLOBAL", "CATEGORY", "PRODUCT"]),
    scopeId: z.string().trim().min(1).max(64).nullable().optional(),
    level: z.coerce.number().int().min(1).max(10),
    /** RATIO（比例）| FIXED（固定金额，订单币种） */
    mode: z.enum(["RATIO", "FIXED"]).default("RATIO"),
    ratio: z.coerce.number().min(0).max(100).default(0),
    fixedAmount: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
    enabled: z.boolean().default(true),
    /** 生效期/失效期（ISO 时间串，可空）；不填=立即生效、长期有效 */
    effectiveAt: z.string().datetime().nullable().optional(),
    expireAt: z.string().datetime().nullable().optional(),
    /** 仅对指定等级的分销商生效（null/不填 = 通用规则） */
    tierLevel: z.coerce.number().int().min(0).max(10).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    // 口径互斥校验：固定金额规则必须有金额，比例规则必须有比例
    if (val.mode === "FIXED") {
      if (val.fixedAmount == null || val.fixedAmount <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fixedAmount"],
          message: "固定金额返佣必须填写大于 0 的金额",
        });
      }
    } else if (val.ratio <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ratio"],
        message: "比例返佣必须填写大于 0 的比例",
      });
    }
    if (val.effectiveAt && val.expireAt && new Date(val.effectiveAt) >= new Date(val.expireAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expireAt"],
        message: "失效时间必须晚于生效时间",
      });
    }
  });

/** 分销策略配置 */
export const distributionConfigSchema = z.object({
  bindTrigger: z.enum(["register", "first_order"]).optional(),
  allowRebind: z.boolean().optional(),
  bindExpireDays: z.coerce.number().int().min(0).max(3650).optional(),
  maxCommissionLevels: z.coerce.number().int().min(1).max(10).optional(),
  maxTotalRatio: z.coerce.number().min(0).max(100).optional(),
  selfPurchaseCommission: z.boolean().optional(),
  selfPurchaseCountForUpstream: z.boolean().optional(),
  settleHoldDays: z.coerce.number().int().min(0).max(365).optional(),
  minWithdrawAmount: z.coerce.number().min(0).max(100_000).optional(),
  /* 风控额度（P0-5）：0 = 不限。上限给到 1e8 只是防呆，真实值由运营按业务定。 */
  dailyWithdrawLimit: z.coerce.number().min(0).max(100_000_000).optional(),
  monthlyWithdrawLimit: z.coerce.number().min(0).max(1_000_000_000).optional(),
  withdrawCooldownHours: z.coerce.number().int().min(0).max(24 * 30).optional(),
});

/** 管理员解绑 */
export const distributionUnbindSchema = z.object({
  bindId: z.string().trim().min(1).max(64),
  note: z.string().trim().max(300).optional(),
});

export type DistributionBindInput = z.infer<typeof distributionBindSchema>;
export type WithdrawApplyInput = z.infer<typeof withdrawApplySchema>;
export type WithdrawAuditInput = z.infer<typeof withdrawAuditSchema>;
export type CommissionRuleInput = z.infer<typeof commissionRuleSchema>;
export type DistributionConfigInput = z.infer<typeof distributionConfigSchema>;
