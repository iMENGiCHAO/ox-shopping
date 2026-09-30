/**
 * 服务端 API 错误文案的英→中映射表。
 *
 * 约定（与 `lib/errors.ts` 配套）：
 *   - 所有 `throw` / `ApiError` / zod 校验消息一律写**英文**（英文前台的默认语言）；
 *   - 中文界面由本表在 `apiHandler` 的统一错误出口按请求语言替换；
 *   - 服务端日志仍保留原始英文，便于排查与检索。
 *
 * 为什么不在 throw 处写中文：`localizeErrorMessage` 只在 lang === "zh" 时翻译，
 * 中文原文会被原样返回给英文站用户（`Unauthorized: 请先登录`），是典型的 i18n 泄漏。
 *
 * 新增错误文案时：先在英文侧写英文，再在下面补一条中文。缺失的中文只会
 * 回落到英文原文，不会崩，所以本表可以增量补齐。
 */
const ERROR_ZH: Record<string, string> = {
  /* ── 通用（lib/errors.ts 的默认文案） ───────────────────────────── */
  "Please sign in first": "请先登录",
  "You do not have permission to perform this action": "没有权限执行此操作",
  "Resource not found": "资源不存在",
  "Too many requests, please try again later": "请求过于频繁，请稍后再试",
  "Invalid request parameters": "请求参数不合法",
  "Internal server error": "服务器内部错误",
  "Request body is not valid JSON": "请求体不是合法的 JSON",
  "CSRF validation failed, please refresh and retry": "CSRF 校验失败，请刷新页面后重试",

  /* ── 再次购买(reorder)跳过原因 —— 前端 toast 展示前经 localizeErrorMessage ── */
  "Out of stock": "缺货",
  Unavailable: "已下架",
  "Failed to add": "加购失败",

  /* ── 认证 / 账号 ───────────────────────────────────────────────── */
  "Incorrect email or password": "邮箱或密码错误",
  "This account has been disabled": "该账号已被禁用",
  /* lib/auth/session.ts —— 会话过期与重放检测（此前在 session.ts 里写死中文，
     英文站会漏出中文；session.ts 不在前台清单里，扫描器未覆盖） */
  "Your session has expired, please sign in again": "登录已过期，请重新登录",
  "Suspicious sign-in detected, please sign in again": "检测到异常登录，请重新登录",
  "This account does not have admin access": "该账号没有管理员权限",
  "This email is already registered": "该邮箱已注册",
  "This reset link is invalid or has expired": "重置链接无效或已过期",
  "This reset link has expired. Please request a new one": "重置链接已过期，请重新申请",
  "This verification link is invalid or has expired": "验证链接无效或已过期",
  /* 找回密码（原站式人工审批流） */
  "You must change your password before continuing": "请先修改密码后再继续操作",
  "You already have a pending password reset request":
    "您已提交过找回密码申请，请等待管理员处理，无需重复提交",
  "This password reset request has already been handled":
    "该找回密码申请已被处理，请刷新后查看最新状态",
  "This password reset request does not exist": "该找回密码申请不存在",
  "There is no pending password reset request for this account": "该账号当前没有在途的找回密码申请",
  "You cannot handle your own password reset request": "不能处理自己的找回密码申请",
  "The new password must be different from the temporary password": "新密码不能与临时密码相同",
  "The new password must be different from the current password": "新密码不能与当前密码相同",
  "Invalid email format": "邮箱格式不正确",
  "Please enter your password": "请输入密码",
  "Please enter your current password": "请输入当前密码",
  "Name must be at least 2 characters": "昵称至少 2 个字符",
  "Name must be at most 60 characters": "昵称最长 60 个字符",
  "Password must be at least 8 characters": "密码至少 8 位",
  "Password must be at most 72 characters": "密码最长 72 位",
  "Password must contain a lowercase letter": "密码必须包含小写字母",
  "Password must contain an uppercase letter": "密码必须包含大写字母",
  "Password must contain a number": "密码必须包含数字",
  "Please enter your first name": "请输入名字",
  "Please enter your last name": "请输入姓氏",

  /* ── 订单 / 购物袋 / 结账 ──────────────────────────────────────── */
  "Order not found": "订单不存在",
  "Shopping Bag item not found": "购物袋商品不存在",
  "Shopping Bag is empty": "购物袋为空",
  "You already have a pending refund request": "您已有待处理的退款申请",
  "This order cannot be cancelled in its current state": "当前状态无法取消此订单",
  "This order is not eligible for a refund in its current state": "当前状态不符合退款条件",
  "This order cannot be paid in its current state": "当前状态无法支付此订单",
  "This order cannot be confirmed in its current state": "当前状态无法确认收货",
  "Some items in your cart are no longer available": "购物袋中部分商品已缺货",
  "Shipping address not found": "收货地址不存在",
  "Refund reason must be at least 5 characters": "退款原因至少 5 个字符",
  "Refund amount must be greater than 0": "退款金额必须大于 0",
  "Order total is invalid": "订单金额无效",
  "Order has not been paid": "订单尚未支付",
  "Please select a shipping method": "请选择物流方式",
  "Please select a payment method": "请选择支付方式",
  "Please select the available options (e.g. color/size) before adding to the bag":
    "请先选择规格（如颜色/尺码）再加入购物袋",

  /* ── 购物袋 / 结账（zod 字段级） ────────────────────────────────── */
  "Attribute name is required": "规格名不能为空",
  "Attribute value is required": "规格值不能为空",
  "At most 20 attributes": "规格最多 20 项",
  "Quantity must be at least 1": "数量至少为 1",
  "Please fill in the shipping address": "请填写收货地址",
  "Please enter your email": "请输入邮箱",
  "Please enter a valid email address": "请输入合法的邮箱地址",
  "Enter a discount code": "请输入折扣码",

  /* ── 折扣码 ────────────────────────────────────────────────────── */
  "This coupon code already exists": "该券码已存在",
  "Coupon not found": "折扣码不存在",
  "Usage limit cannot be lower than the redeemed count":
    "总量上限不能小于已核销次数（如需停用请关闭「启用」）",
  "Coupons with redemptions cannot be deleted":
    "已有核销记录的折扣码不能删除（会丢失订单优惠溯源），请改为停用",

  /* ── 频控 / 账号状态（2026-09-19 补：原先这些文案在路由里写死中文） ── */
  "Too many failed attempts — this account is temporarily locked. Please try again in 15 minutes":
    "失败次数过多，账号已临时锁定，请 15 分钟后再试",
  "Invalid registration details, please refresh the page and try again":
    "注册信息无效，请刷新页面后重试",
  "Account not found": "账号不存在",
  "This email is already verified": "邮箱已验证，无需重发",
  "Current password is incorrect": "当前密码不正确",
  "The new email is the same as your current email": "新邮箱与当前邮箱相同",
  "This email is already used by another account": "该邮箱已被其他账号使用",
  "You already have a pending account-deletion request. To withdraw it, cancel the current request first":
    "您已提交过注销申请，客服正在处理中；如需撤回请先取消当前申请",
  "There is no pending account-deletion request to withdraw": "当前没有在途的注销申请，无需撤回",

  /* ── 商品 / 目录 / 地址 ─────────────────────────────────────────── */
  "Product not found": "商品不存在",
  "Product not found or no longer available": "商品不存在或已下架",
  "Category not found": "分类不存在",
  "Address not found": "地址不存在",
  "This variant is in stock — you can add it to your bag now":
    "所选规格当前有货，可直接购买，无需登记到货通知",

  /* ── 支付渠道 ──────────────────────────────────────────────────── */
  "Mock payment is not enabled": "模拟支付未启用",
  "Payment channel not found": "支付渠道不存在",
  "This payment channel is not enabled": "支付渠道未启用",
  "A payment channel with this code already exists": "渠道 code 已存在",
  "Configure this channel before enabling it — an unconfigured channel cannot accept payments":
    "请先完成该渠道的参数配置，再启用（未配置的渠道无法收款）",
  "Alipay refunds are not connected to the live gateway yet.":
    "支付宝渠道尚未接入真实退款请求（开发阶段）。",
  "Bank card refunds are not connected to the live gateway yet.":
    "银行卡渠道尚未接入真实退款请求（支付账户未接入）。",
  "PayPal refunds are not connected to the live gateway yet.":
    "PayPal 渠道尚未接入真实退款请求（支付账户未接入）。",
  "WeChat Pay refunds are not connected to the live gateway yet.":
    "微信支付渠道尚未接入真实退款请求（开发阶段）。",
  "Missing Stripe Payment Intent ID — cannot issue a gateway refund":
    "缺少 Stripe Payment Intent ID，无法发起网关退款",
  "This payment method is not available yet, please choose another one":
    "该支付渠道暂未开通，请选择其他支付方式",
  "This payment method is not configured, please choose another one":
    "该支付渠道尚未配置，请选择其他支付方式",
  "This payment method does not support your checkout currency — switch currency or choose another one":
    "该支付渠道不支持当前结算币种，请切换币种或选择其他支付方式",
  // 预留级渠道被调用时（理论上到不了：前台已置灰，但服务端必须兜底）
  "Alipay is configured but the live payment request is not wired up yet. It will be available once the merchant account is onboarded.":
    "支付宝渠道已配置，但尚未接入真实下单请求。请在申请到商户账号并完成对接后使用。",
  "WeChat Pay is configured but the live payment request is not wired up yet. It will be available once the merchant account is onboarded.":
    "微信支付渠道已配置，但尚未接入真实下单请求。请在申请到商户号并完成对接后使用。",
  "Bank card payment is configured but the live payment request is not wired up yet. It will be available once the merchant account is onboarded.":
    "银行卡渠道已配置，但尚未接入真实下单请求。请在申请到商户账号并完成对接后使用。",
  "PayPal is configured but the live payment request is not wired up yet. It will be available once the merchant account is onboarded.":
    "PayPal 渠道已配置，但尚未接入真实下单请求。请在申请到商户账号并完成对接后使用。",

  /* ── 订单状态机与鉴权 ──────────────────────────────────────────── */
  "Paid orders must go through the refund flow instead of being cancelled":
    "已支付订单请走退款流程，不能直接取消",
  "Carrier is required when marking an order as shipped": "发货时必须填写物流公司",
  "Tracking number is required when marking an order as shipped": "发货时必须填写物流单号",
  "Order status has changed, please refresh and try again": "订单状态已变更，请刷新后重试",
  "You don't have access to this order": "无权访问该订单",

  /* ── 分销（提现/绑定/冲正 —— 顾客侧分销中心与后台共用同一批文案） ── */
  "Invalid withdrawal amount": "提现金额不合法",
  "Please provide the payee real name (required for identity verification before payout)":
    "请填写收款人实名（线下打款需要核对身份）",
  "Please choose a payout method": "请选择收款方式",
  "Insufficient withdrawable balance": "可提现余额不足",
  "You already have a withdrawal request in progress; please wait until it is processed":
    "您已有一笔在途提现申请，请等待处理完成后再提交",
  "Withdrawal request not found": "提现单不存在",
  "This withdrawal request cannot be approved in its current state": "该提现单当前状态不可审核通过",
  "This withdrawal request cannot be marked as paid in its current state":
    "该提现单当前状态不可标记为已打款",
  "This withdrawal request cannot be rejected in its current state": "该提现单当前状态不可驳回",
  "Binding relationship not found": "绑定关系不存在",
  "This binding is no longer active": "该绑定已失效",
  "Rebind request not found": "换绑申请不存在",
  "This request has already been processed": "该申请已处理，请勿重复操作",
  "The target upline account is unavailable (disabled or missing a referral code); rebind cannot be completed":
    "目标上级账号不可用（已禁用或缺少推广码），无法完成换绑",
  "Commission log not found": "佣金流水不存在",
  "This commission has already been fully reversed": "该笔佣金已全额冲正，无需重复操作",
  "Invalid commission amount; cannot reverse": "该笔佣金金额异常，无法冲正",
  "Reversal amount must be greater than 0": "冲正金额必须大于 0",
  "User not found": "用户不存在",
  "Failed to generate a referral code; please try again later": "推广码生成失败，请稍后重试",
  "Distributor tier must be an integer between 0 and 10 (0 = standard)":
    "分销商等级需为 0 ~ 10 的整数（0=普通）",
  "This user is not a distributor yet (auto-promoted after their first successful referral)":
    "该用户还不是分销商（首次成功推广后自动成为分销商）",
  /* 结算币种（分销商账户 + 下单支付币种校验 —— 顾客可见，源串在服务端） */
  "Settlement currency must be a 3-letter ISO 4217 code": "结算币种必须是 3 位 ISO 4217 代码",
  "Account has commission logs or balance — settlement currency cannot be changed (withdraw the full balance first; only new accounts can choose freely)":
    "账户已有佣金流水或余额，不能变更结算币种（请先提空余额；新账户才可自由选择）",
  /* ── 订单退款 / 发货（后台操作文案，但源串统一英文） ── */
  "Missing carrier; please fill in tracking info before marking as shipped":
    "缺少物流公司，请先补填物流信息再标记已发货",
  "Missing tracking number; please fill in tracking info before marking as shipped":
    "缺少物流单号，请先补填物流信息再标记已发货",
  "Order has already been fully refunded or reserved":
    "订单已全额退款或已有退款处理中，无法再次退款",
  "Refund request not found": "退款申请不存在",
  "This refund request has already been processed": "该退款申请已处理，请勿重复操作",
};

/**
 * 带插值的错误文案 —— 精确查表命中不了（`Option "Size" is not available…`
 * 每次插值都不同），只能按模式匹配。
 *
 * 为什么需要：订单/购物袋这类校验要把**用户输入或库存数字**带回提示里，
 * 文案本身是模板。若不做模式本地化，这些提示在中文界面下会一直显示英文。
 * 规则按顺序匹配，命中即返回；放在精确表之后。
 */
const PATTERN_ZH: Array<{ test: RegExp; zh: (...groups: string[]) => string }> = [
  {
    test: /^Option "(.+)" is not available for this product$/,
    zh: (name) => `规格「${name}」不是该商品的可选规格`,
  },
  {
    test: /^Option "(.+)" value "(.+)" is invalid$/,
    zh: (name, value) => `规格「${name}」的值「${value}」无效`,
  },
  {
    test: /^Not enough stock — only (.+) left$/,
    zh: (n) => `库存不足，当前仅剩 ${n} 件`,
  },
  {
    test: /^Your Shopping Bag can hold at most (.+) different items$/,
    zh: (n) => `Shopping Bag 最多 ${n} 种商品`,
  },
  {
    test: /^"(.+)" is not available in the selected option \((.+)\)$/,
    zh: (name, label) => `「${name}」在所选规格（${label}）下不可购买`,
  },
  // ── 订单状态机与鉴权（顾客可见；源串统一在 order.service.ts）─────────────
  // 注意顺序：带 "directly" 的规则必须排在**前面**，否则会被下面更宽的规则吃掉。
  {
    test: /^Cannot change order status from "(.+)" to "(.+)"$/,
    zh: (from, to) => `不允许从「${from}」变更为「${to}」`,
  },
  {
    test: /^Order in status "(.+)" cannot be marked as refunded directly$/,
    zh: (status) => `当前状态「${status}」不可直接置为已退款`,
  },
  {
    test: /^Order in status "(.+)" cannot be marked as refunded$/,
    zh: (status) => `当前状态「${status}」不可标记为已退款`,
  },
  // ── 库存/规格售罄（下单事务内抛出，顾客可见）──────────────────────────
  {
    test: /^"(.+)" variant (.+):(.+) is out of stock — only (.+) left$/,
    zh: (name, group, value, n) => `「${name}」的规格 ${group}:${value} 已售罄 — 仅剩 ${n} 件`,
  },
  {
    test: /^"(.+)" is out of stock — only (.+) left$/,
    zh: (name, n) => `「${name}」已售罄 — 仅剩 ${n} 件`,
  },
  // ── 分销 / 退款的插值文案 ──
  {
    test: /^Withdrawals must be at least (.+) hours apart; please retry in (.+) hour\(s\)$/,
    zh: (hours, wait) => `两次提现需间隔 ${hours} 小时，请 ${wait} 小时后再试`,
  },
  {
    test: /^Daily withdrawal limit exceeded \(limit (.+), applied today (.+)\)$/,
    zh: (limit, today) => `超出单日提现上限（${limit} 元，今日已申请 ${today} 元）`,
  },
  {
    test: /^Monthly withdrawal limit exceeded \(limit (.+), applied this month (.+)\)$/,
    zh: (limit, month) => `超出单月提现上限（${limit} 元，本月已申请 ${month} 元）`,
  },
  {
    test: /^Minimum withdrawal amount is (.+)$/,
    zh: (min) => `最低提现金额为 ${min} 元`,
  },
  {
    test: /^Rebind failed \((.+)\); please check the customer current binding state$/,
    zh: (outcome) => `换绑落库失败（${outcome}），请检查客户当前绑定状态`,
  },
  {
    test: /^Reversal amount exceeds the remaining reversible balance \(available: (.+)\)$/,
    zh: (n) => `冲正金额不得超过未冲正余额（当前可冲正 ${n}）`,
  },
  {
    test: /^Total refund exceeds the order total: already used\/refunded (.+), this request (.+), order total (.+)$/,
    zh: (used, amount, total) =>
      `累计退款超出订单金额：已占用/已退 ${used}，本笔 ${amount}，订单总额 ${total}`,
  },
  {
    test: /^Refund failed: (.+)$/,
    zh: (err) => `退款失败：${err}`,
  },
  // ── 结算币种（分销账户 + 下单支付币种校验 —— 顾客可见，源串在服务端）──
  {
    test: /^Settlement currency (.+) rate unavailable — cannot calculate the withdrawal limit right now, please try again later or contact support$/,
    zh: (code) => `结算币种 ${code} 的汇率不可用，暂时无法核算提现限额，请稍后再试或联系客服`,
  },
  {
    test: /^Settlement currency (.+) is not enabled — choose from the available currencies$/,
    zh: (currency) => `结算币种 ${currency} 未启用或不支持，请从可用币种列表中选择`,
  },
  {
    test: /^Currency \((.+)\) is not payable — switch to a payable currency in the currency selector and resubmit$/,
    zh: (currency) => `当前币种（${currency}）暂不支持结算，请在币种选择器切换到可支付的币种后重新提交`,
  },
  {
    test: /^Stock has been changed by another operation — refresh and retry$/,
    zh: () => `库存已被其他操作变更，请刷新后重试`,
  },
];

/**
 * 按请求语言本地化错误文案。lang === "zh" 时查表翻译，其余（含未命中）原样返回。
 */
export function localizeErrorMessage(message: string, lang: string): string {
  if (lang !== "zh") return message;
  const exact = ERROR_ZH[message];
  if (exact !== undefined) return exact;
  for (const rule of PATTERN_ZH) {
    const m = message.match(rule.test);
    if (m) return rule.zh(...m.slice(1));
  }
  return message;
}

/**
 * 本地化 zod 校验的字段级错误（`details: [{ path, message }]`）。
 *
 * 为什么需要：`localizeErrorMessage` 只处理顶层 `message`，
 * 字段级消息原样返回，导致中文界面下表单报英文（或英文界面下报中文）。
 * 非数组 / 结构不符时原样返回，保证向后兼容。
 */
export function localizeErrorDetails(details: unknown, lang: string): unknown {
  if (lang !== "zh" || !Array.isArray(details)) return details;
  return details.map((d) => {
    if (!d || typeof d !== "object") return d;
    const rec = d as { message?: unknown };
    if (typeof rec.message !== "string") return d;
    return { ...rec, message: localizeErrorMessage(rec.message, lang) };
  });
}
