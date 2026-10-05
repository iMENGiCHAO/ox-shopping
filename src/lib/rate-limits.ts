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
  /** 登录失败锁定（硬锁）：单 IP×邮箱 连续 5 次口令失败 → 锁 15 分钟。
   * 键含 IP：攻击者只能锁掉自己的 IP 组合，受害者从他自己的 IP 登录不受影响
   * （安全审计修复：此前键为纯邮箱，任何人 5 次错密码即可把已知账号永久锁死 ——
   * 未授权永久 DoS，含管理员账号）。计数只在**真实口令失败**后递增（peek+hit 分离），
   * 被上游限流拒绝的请求与未知邮箱探测不再误烧锁定额度。 */
  loginLock: { limit: 5, windowSeconds: 900 },
  /** 登录失败节流（分布式爆破兜底，跨 IP 的纯邮箱维度）：
   * 只计真实口令失败；第 4 次起响应前追加指数延迟（0.5s→10s 封顶，见 login 路由），
   * 15 分钟内累计 10 次失败 → 硬锁（_botnet 并行猜测必须可阻断，纯延迟可被并行绕过）。
   * 残余权衡：知道邮箱的定向攻击者可用 10 次请求让该邮箱硬锁 15 分钟 —— 这是
   * 「防爆破」与「防 DoS」在无验证码体系下的固有取舍，触发时会落审计告警供运营识别。 */
  loginThrottle: { limit: 10, windowSeconds: 900 },
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
  /** 到货提醒订阅（IP 桶）：20 次/小时——单邮箱桶可被轮换邮箱绕过，
   * IP 桶挡「轮换邮箱无限灌 NotifyMe 行 → 补货时邮件轰炸 + DB 灌水」（权限审计修复） */
  notifyMeIp: { limit: 20, windowSeconds: 3600 },
  /** 退款申请：单订单 3 次/10 分钟——每笔申请都会 notifyAdmins 刷后台待办，
   * 攻击者持 N 个游客单 token 可无限刷管理员通知队列（权限审计修复） */
  refundRequest: { limit: 3, windowSeconds: 600 },
  /** 地址簿变更：正常使用远低于此——双击/脚本灌地址簿的兜底闸门 */
  addressMutation: { limit: 10, windowSeconds: 60 },
  /** 敏感口令复核（改密/换邮箱的 currentPassword 校验）：防在线爆破当前口令 */
  passwordVerify: { limit: 5, windowSeconds: 900 },
  /** 分销绑定关系变更：单用户 10 次/小时 */
  distBind: { limit: 10, windowSeconds: 3600 },
  /** 分销提现申请：单用户 5 次/小时（另有单笔在途约束兜底） */
  distWithdraw: { limit: 5, windowSeconds: 3600 },
  /** 支付入口（发起/重试支付会话）：单订单 10 次/分钟 —— 每次都会创建网关会话，
   *  防脚本反复拉取（与 mockPay 同口径）。 */
  orderPay: { limit: 10, windowSeconds: 60 },
  /** 汇率刷新（触发外部汇率 API 调用）：单管理员 6 次/小时 —— 上游是免费接口，
   *  滥用会被限流/封禁。 */
  adminCurrencyRefresh: { limit: 6, windowSeconds: 3600 },
  /** 用户自助数据导出（GDPR 第 15 条）：单用户 3 次/小时 ——
   *  单次返回全量 PII（资料/地址/订单/退款/会话元数据），防被反复整包拉取。 */
  userExport: { limit: 3, windowSeconds: 3600 },
  /** 站内检索（页面/FAQ/商品参数表）：单 IP 30 次/分钟 + 全站熔断 600 次/分钟 ——
   *  公开端点且含 `"sizeChart"::text ILIKE` 全表扫，无限流时可被刷满 DB CPU
   *  （安全审计：q 也无长度上限）。 */
  searchPages: {
    limit: 30,
    windowSeconds: 60,
    breakerKey: "search-pages:__global__",
    breakerLimit: 600,
    breakerWindowSeconds: 60,
  },
  /** 后台邮件通道自检：单管理员 10 次/小时（测试邮件会真实发出，防手抖连点） */
  adminMailTest: { limit: 10, windowSeconds: 3600 },
  /** 后台订单导出：单管理员 4 次/10 分钟 —— 导出含收件人姓名/电话/邮箱（PII），
   *  单次最多 5000 行；被盗或内部滥用的 SUPPORT 会话不应能无限循环拉取
   *  （安全审计：此前 admin 路由除 mail-test 外零限流） */
  adminExport: { limit: 4, windowSeconds: 600 },
  /** 后台上传（本地直传 + S3 预签名）：单管理员 30 次/10 分钟 ——
   *  防脚本化会话灌满对象存储/本地盘（无成本上限的上传是存储费用放大器） */
  adminUpload: { limit: 30, windowSeconds: 600 },
} satisfies Record<string, RateLimitPolicy>;
