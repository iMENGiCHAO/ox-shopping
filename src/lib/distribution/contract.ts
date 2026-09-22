/**
 * 分销模块**契约层**（纯类型 + 常量，零副作用、可被 client/server 同时引用）。
 *
 * 为什么单独成层（大爷要求「隔离、解耦、接口调用」）：
 *   1. 商城代码只允许 import 本文件与 `bridge.ts`，永远不 import 分销 service 内部实现；
 *   2. 本文件不含 `server-only`、不碰 Prisma / env，因此可以在客户端组件里安全引用
 *      （分销后台的页面需要这些枚举与 DTO 类型）；
 *   3. 整块模块的开关常量也在这里 —— `DISTRIBUTION_ENABLED=false` 时，商城行为与
 *      接入前完全一致（不留任何可见痕迹）。
 */

/* ─────────────────────────── 开关 ─────────────────────────── */

/**
 * 分销模块总开关（环境变量 `DISTRIBUTION_ENABLED`）。
 * - `false`：代理层不写推广 cookie、商城不上报归属、分销 API 全部 404、后台入口隐藏；
 * - 未设置：默认开启（大爷要求「完整实施」，默认可用；要临时下线只改这一个变量）。
 */
export function isDistributionEnabled(): boolean {
  return process.env.DISTRIBUTION_ENABLED !== "false";
}

/* ─────────────────────────── 常量 ─────────────────────────── */

/** 推广标识 cookie 名（签名后存储，防篡改归属） */
export const DIST_REF_COOKIE = "dist_ref";

/** URL 上可识别的推广参数名（原站式链接形态，全部兼容） */
export const DIST_REF_PARAMS = ["ref", "distributor_id", "invite"] as const;

/**
 * 推广 cookie 有效期（天）。客户点链接后即使过几天才下单，归属依然生效；
 * 与「绑定有效期 `bindExpireDays`」是两件事：前者是**归因窗口**，后者是**绑定寿命**。
 */
export const DIST_REF_COOKIE_TTL_DAYS = 30;

/**
 * 分销中心路径（**只有分销商本人**进入的独立页面，自带外壳，不套商城页头页脚）。
 * 大爷 2026-09-20 明确要求：分销后台不能与商城搅在一起，入口只从个人资料页的分享卡片进。
 */
export const DISTRIBUTION_CONSOLE_PATH = "/distribution";

/**
 * 推广链接的**落地路径**：给朋友点的是正常商城首页（不是别人的后台），
 * 代理层在这里捕获 `?ref=CODE` 并写签名 cookie，注册/首单时完成归属。
 */
export const DISTRIBUTION_INVITE_PATH = "/";

/** 佣金与提现的记账币种（统一 CNY，与后台「累计消费」同口径） */
export const COMMISSION_CURRENCY = "CNY";

/* ─────────────────────── 合规硬限（P0-4） ─────────────────────── */

/**
 * 返佣层级上限（合规红线）。
 *
 * 国内「三级分销」是法律红线：**超过三级 + 团队计酬**极易被认定为传销。
 * 因此 `maxCommissionLevels` 默认最多 3 —— 这条**不能只靠默认值**：
 * 默认值挡不住一次误操作（后台把 3 改成 10 就生效了），必须由服务端强制夹住。
 *
 * 要合法地放开（例如纯单品返利、无团队计酬）需**显式**设置环境变量：
 *   `DISTRIBUTION_ALLOW_DEEP_LEVELS=true`
 * 未设置时任何 >3 的配置都会被夹回 3 并打警告日志（见 `config.service.ts`）。
 */
export const COMPLIANCE_MAX_LEVELS = 3;

/** 技术上限（关系链本身不限级，只是不返佣） */
export const ABSOLUTE_MAX_LEVELS = 10;

export function allowDeepCommissionLevels(): boolean {
  return process.env.DISTRIBUTION_ALLOW_DEEP_LEVELS === "true";
}

/** 佣金流水状态 */
export type CommissionState = "PENDING" | "SETTLED" | "REVERSED";

/** 提现单状态 */
export type WithdrawState = "PENDING" | "APPROVED" | "PAID" | "REJECTED";

/** 绑定来源 */
export type BindType = "link" | "qrcode" | "code" | "manual";

/** 绑定状态 */
export type BindStatus = "ACTIVE" | "RELEASED";

/** 佣金规则作用域 */
export type CommissionScope = "GLOBAL" | "CATEGORY" | "PRODUCT";

/* ─────────────────────────── 可配置项 ─────────────────────────── */

/**
 * 分销策略配置（存 `site_settings` 的 `distribution` 键，后台可视化修改）。
 * 每一项都是**业务口径**，不是技术开关；默认值即产品文档里推荐的合规口径。
 */
export interface DistributionConfig {
  /** 绑定触发点：register=注册即绑定；first_order=首次下单才绑定 */
  bindTrigger: "register" | "first_order";
  /** 是否允许换绑（默认 false：首次绑定定终身，不可抢绑） */
  allowRebind: boolean;
  /** 绑定有效期（天）；0=永久 */
  bindExpireDays: number;
  /** 实际返佣层级上限（关系链仍无限级，超出只记录关系不返佣） */
  maxCommissionLevels: number;
  /** 总返佣比例上限（百分数）；防止规则配错把利润返穿 */
  maxTotalRatio: number;
  /** 自购是否给自己佣金（默认 false） */
  selfPurchaseCommission: boolean;
  /** 自购是否仍给上级分佣（默认 true） */
  selfPurchaseCountForUpstream: boolean;
  /** 支付成功后自动转「可结算」的持有天数（确认收货即刻结算，不受此限制） */
  settleHoldDays: number;
  /** 最低提现金额（CNY） */
  minWithdrawAmount: number;
  /**
   * 单日提现总额上限（CNY）；**0 = 不限**。
   * 风控用途：账号被盗时避免一次性把余额提空 —— 单笔金额再大也受当日累计约束。
   */
  dailyWithdrawLimit: number;
  /** 单月提现总额上限（CNY）；0 = 不限 */
  monthlyWithdrawLimit: number;
  /** 两次提现之间的冷却小时数；0 = 无冷却 */
  withdrawCooldownHours: number;
}

export const DEFAULT_DISTRIBUTION_CONFIG: DistributionConfig = {
  bindTrigger: "register",
  allowRebind: false,
  bindExpireDays: 0,
  maxCommissionLevels: 3,
  maxTotalRatio: 30,
  selfPurchaseCommission: false,
  selfPurchaseCountForUpstream: true,
  settleHoldDays: 15,
  minWithdrawAmount: 100,
  /* 风控默认值（P0-5）：给一个"正常分销商够用、被盗号也提不空"的额度。
     日均 5000 元对个体分销商足够；月度 50000 元封顶。要放宽在后台改即可。 */
  dailyWithdrawLimit: 5000,
  monthlyWithdrawLimit: 50000,
  withdrawCooldownHours: 0,
};

/** 默认三级比例（后台可改）：一级 10% / 二级 5% / 三级 2% */
export const DEFAULT_COMMISSION_RATIOS: Record<number, number> = {
  1: 10,
  2: 5,
  3: 2,
  4: 1,
  5: 0.5,
};

/* ─────────────────────────── DTO（接口出参） ─────────────────────────── */

/** 分销身份摘要（个人中心/推广页展示） */
export interface DistributionIdentity {
  referralCode: string;
  /** 给朋友分享的链接（落地商城首页 + ?ref=） */
  inviteUrl: string;
  /** 分销中心页面路径（本人进入；独立外壳） */
  consolePath: string;
  inviteCode: string;
  isDistributor: boolean;
  /** 我的直属上级昵称（脱敏邮箱），自然流量为 null */
  inviterName: string | null;
  /** 我绑定的上级（作为客户） */
  boundToName: string | null;
  directCount: number;
  teamCount: number;
  firstPromoteAt: string | null;
}

/** 分销账户摘要（余额口径 CNY） */
export interface DistributionAccountSummary {
  /** 是否已确认《分销规则》（提现前必须确认） */
  termsAccepted: boolean;
  termsAcceptedAt: string | null;
  balance: number;
  frozen: number;
  totalCommission: number;
  pendingCommission: number;
  settledCommission: number;
}

/** 我的佣金明细行 */
export interface CommissionRow {
  id: string;
  orderNumber: string;
  orderAmount: string;
  currency: string;
  level: number;
  ratio: number;
  amount: number;
  amountCny: number;
  status: CommissionState;
  createdAt: string;
  settledAt: string | null;
}

/** 团队/客户订单行（敏感字段已由服务端脱敏） */
export interface TeamOrderRow {
  orderNumber: string;
  status: string;
  currency: string;
  total: string;
  createdAt: string;
  /** 买家展示名（昵称；邮箱脱敏） */
  buyerName: string;
  /** 手机号脱敏，如 138****1234 */
  buyerPhone: string;
  /** 仅省市，详细地址不下发 */
  region: string;
  /** 该订单给我的佣金（CNY），无则 null */
  myCommissionCny: number | null;
  /** 归属层级：1=我的直接客户，>=2 属于下级团队 */
  level: number;
}
