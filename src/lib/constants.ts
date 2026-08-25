/** Cookie 名称 */
export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";
export const REQUEST_ID_HEADER = "x-request-id";

/** 分页默认值 */
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;

/** Shopping Bag数量上限(防滥用) */
export const MAX_CART_ITEM_QUANTITY = 99;
export const MAX_CART_ITEMS = 50;

/** Reviews */
export const REVIEW_MIN_RATING = 1;
export const REVIEW_MAX_RATING = 5;

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

export const DEFAULT_CURRENCY = process.env.CURRENCY || "USD";
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
export const RESET_TOKEN_TTL = 30 * 60; // 密码重置 30min
