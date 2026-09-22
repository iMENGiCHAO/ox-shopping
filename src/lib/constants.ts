/** Cookie 名称 */
export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const CSRF_COOKIE = "csrf_token";
/** 登录态「提示」cookie（httpOnly=false）：仅供前端 JS 做 UI 分支；鉴权仍走 httpOnly 的 access_token */
export const LOGGED_IN_COOKIE = "logged_in";
/**
 * 强制改密标记 cookie（httpOnly）：管理员发放临时密码后登录时置位。
 *
 * 为什么用 cookie 而不是只查库：`proxy.ts`（Next 16 中间件）在**边缘**拦截时
 * 无法查库，需要在 O(1) 内判定是否把用户钉在改密页；DB 侧的权威判定在
 * `requireUser()`（读到 `mustChangePassword` 即抛 403）。两者一致才是完整闭环：
 *   - cookie 负责页面跳转与 API 快速拒绝；
 *   - `requireUser()` 负责防篡改（用户手删 cookie 也绕不过接口层）。
 */
export const PASSWORD_CHANGE_REQUIRED_COOKIE = "pwd_change_required";
export const CSRF_HEADER = "x-csrf-token";
export const REQUEST_ID_HEADER = "x-request-id";

/** 分页默认值 */
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;

/** Shopping Bag数量上限(防滥用) */
export const MAX_CART_ITEM_QUANTITY = 99;
export const MAX_CART_ITEMS = 50;

/**
 * 搜索页价格筛选（基准币种金额，与 CURRENCY 挂钩）。
 * 之前这两个魔数写在 search-sidebar-filters.tsx 里，
 * 且货币符号被硬编码成 `€`（与基准币种 USD 冲突），一并收口到这里。
 */
export const PRICE_FILTER_SLIDER_MAX = 100;
export const PRICE_FILTER_INPUT_MAX = 1000;

/**
 * 订单/商业常量：直接读 process.env（与 src/lib/env.ts 的 zod 默认值保持一致）。
 * 本模块必须保持零副作用——它被 client 组件引入，
 * 不能拖入 env.ts（其顶层在生产模式会执行密钥 fail-fast）。
 */
const numOr = (v: string | undefined, d: number): number => {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/**
 * 客户端可见的默认币种：Next 不会把 .env 注入到 client bundle，
 * 真实 `env.CURRENCY` 仅在 server 侧可读。client 端固定按 "USD" 兜底，
 * 真正的展示币种由 currency-provider 初始化时调 /api/currency/rates 决定。
 * 保持与 CURRENCIES 表中的基准币种一致。
 */
export const DEFAULT_CURRENCY = "USD";
export const SHIPPING_FEE = numOr(process.env.SHIPPING_FEE, 10);
export const FREE_SHIPPING_THRESHOLD = numOr(process.env.FREE_SHIPPING_THRESHOLD, 99);
export const TAX_RATE = numOr(process.env.TAX_RATE, 0);
export const ORDER_EXPIRE_SECONDS = numOr(process.env.ORDER_EXPIRE_SECONDS, 1800);

/** 上传 */
export const UPLOAD_MAX_BYTES = numOr(process.env.UPLOAD_MAX_BYTES, 10 * 1024 * 1024);
export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/** 验证码/令牌有效期(秒) */
export const EMAIL_TOKEN_TTL = 24 * 3600; // 邮箱验证 24h
