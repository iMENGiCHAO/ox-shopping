import { env } from "@/lib/env";

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

/** 订单 */
export const DEFAULT_CURRENCY = env.CURRENCY;
export const SHIPPING_FEE = env.SHIPPING_FEE;
export const FREE_SHIPPING_THRESHOLD = env.FREE_SHIPPING_THRESHOLD;
export const TAX_RATE = env.TAX_RATE;
export const ORDER_EXPIRE_SECONDS = env.ORDER_EXPIRE_SECONDS;

/** 上传 */
export const UPLOAD_MAX_BYTES = env.UPLOAD_MAX_BYTES;
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
