import type { RateLimitOptions } from "@/lib/rate-limit";

/**
 * 全站限流策略集中定义（单一事实来源，14 处 API 调用点共用）。
 *
 * 设计约束（解耦思想）：
 * - 本模块只放「数值策略」（limit / 窗口 / 熔断），**不含限流键名**——
 *   键名内嵌动态标识（IP / 邮箱 / userId / 订单号），由调用方拼装；
 * - 修改任何阈值只改这里，路由层不再散落魔法数字（调用方只负责"用哪条策略"）；
 * - 熔断（breaker*）是端点级全站总量兜底：单桶按标识限流可被标识轮换绕过，
 *   熔断与标识无关。只有「通过单桶检查」的请求才计入熔断额度（见 rate-limit.ts）。
 *
 * 数值调整注意：改动会直接影响安全姿态与可用性的平衡，
 * 同步核对 docs/PRODUCTION_CHECKLIST.md 的对外口径，避免文档与代码漂移。
 */

export type RateLimitPolicy = Omit<RateLimitOptions, "key">;

export const RATE_LIMITS = {
  /** 登录失败锁定：同一邮箱（跨 IP）连错 5 次 → 锁 15 分钟，防分布式爆破 */
  loginLock: { limit: 5, windowSeconds: 900 },
  /** 登录尝试：单 IP×邮箱 5 次/分钟；全站熔断 900 次/分钟（防轮换 IP 撞库横向扫多账号） */
  loginAttempt: {
    limit: 5,
    windowSeconds: 60,
    breakerKey: "login:__global__",
    breakerLimit: 900,
    breakerWindowSeconds: 60,
  },
  /** 注册：单 IP 3 次/分钟；全站熔断 100 次/小时（防 IP 池批量灌水） */
  register: {
    limit: 3,
    windowSeconds: 60,
    breakerKey: "register:__global__",
    breakerLimit: 100,
    breakerWindowSeconds: 3600,
  },
  /** 找回密码（按 IP）：3 次/分钟；全站熔断 200 次/小时（防标识轮换刷后台待办） */
  forgotPassword: {
    limit: 3,
    windowSeconds: 60,
    breakerKey: "forgot:__global__",
    breakerLimit: 200,
    breakerWindowSeconds: 3600,
  },
  /** 找回密码（按邮箱）：3 次/小时，防拿他人邮箱刷后台待办 */
  forgotPasswordEmail: { limit: 3, windowSeconds: 3600 },
  /** 会话静默续期（proxy 内 rotateSession 的配套端点）：单 IP 10 次/分钟 */
  refresh: { limit: 10, windowSeconds: 60 },
  /** 邮箱验证邮件重发：单用户 3 次/10 分钟 */
  verifyResend: { limit: 3, windowSeconds: 600 },
  /** 下单：单用户/单 IP 5 次/10 分钟；游客无稳定标识，另设全站熔断 300 单/10 分钟（防刷单） */
  orderCreate: {
    limit: 5,
    windowSeconds: 600,
    breakerKey: "order-create:__global__",
    breakerLimit: 300,
    breakerWindowSeconds: 600,
  },
  /** 模拟支付确认：单订单 10 次/分钟 */
  mockPay: { limit: 10, windowSeconds: 60 },
  /** 优惠券试算：单用户/单 IP 20 次/10 分钟；游客全站熔断 600 次/10 分钟（试算是撞码枚举入口） */
  couponApply: {
    limit: 20,
    windowSeconds: 600,
    breakerKey: "coupon-apply:__global__",
    breakerLimit: 600,
    breakerWindowSeconds: 600,
  },
  /** 到货提醒订阅：单邮箱 5 次/小时（另有同邮箱+商品去重兜底） */
  notifyMe: { limit: 5, windowSeconds: 3600 },
  /** 分销绑定关系变更：单用户 10 次/小时 */
  distBind: { limit: 10, windowSeconds: 3600 },
  /** 分销提现申请：单用户 5 次/小时（另有单笔在途约束兜底） */
  distWithdraw: { limit: 5, windowSeconds: 3600 },
  /** 后台邮件通道自检：单管理员 10 次/小时（测试邮件会真实发出，防手抖连点） */
  adminMailTest: { limit: 10, windowSeconds: 3600 },
} satisfies Record<string, RateLimitPolicy>;
