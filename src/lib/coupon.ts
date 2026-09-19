import type { CouponType } from "@prisma/client";

/**
 * 折扣码的**前后端共用**定义与文案映射。
 *
 * 为什么单独一个模块：券的校验失败原因（NOT_FOUND / EXPIRED / MIN_SPEND …）在
 * 服务端（下单事务）和客户端（结账页「应用」按钮）都要转成面向用户的文案。
 * 若两边各写一套，必然出现「结算页说已过期、下单时说门槛不够」这类不一致。
 * 这里以「英文源串 = i18n 词典键」的方式收口（与全站 t() 的约定一致），
 * 服务端用 translate()、客户端用 useT() 取同一个键，文案天然一致。
 *
 * 本模块必须保持零副作用、零 server-only 依赖——它会被 client 组件引入。
 */

/** 券校验失败原因 */
export type CouponRejectReason =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "MIN_SPEND"
  | "USAGE_LIMIT"
  | "PER_USER_LIMIT"
  | "NOT_APPLICABLE";

/** 原因码 → i18n 词典键（键即英文源串） */
export const COUPON_REASON_KEY: Record<CouponRejectReason, string> = {
  NOT_FOUND: "This discount code doesn't exist",
  INACTIVE: "This discount code is no longer active",
  NOT_STARTED: "This discount code isn't valid yet",
  EXPIRED: "This discount code has expired",
  USAGE_LIMIT: "This discount code has reached its usage limit",
  PER_USER_LIMIT: "You've already used this discount code",
  NOT_APPLICABLE: "This discount code can't be applied to your order",
  // MIN_SPEND 有专用文案（带差额），见 couponReasonMessage
  MIN_SPEND: "This discount code can't be applied to your order",
};

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * 把校验失败原因渲染成面向用户的文案。
 * @param shortfall 未达门槛时的差额（已由调用方格式化成本币种字符串）
 */
export function couponReasonMessage(
  reason: CouponRejectReason,
  t: TranslateFn,
  shortfall?: string,
): string {
  if (reason === "MIN_SPEND" && shortfall) {
    return t("Spend {amount} more to use this discount code", { amount: shortfall });
  }
  return t(COUPON_REASON_KEY[reason]);
}

/** 券的展示类型（供前台/后台共用） */
export interface CouponView {
  code: string;
  type: CouponType;
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  endsAt: string | Date;
  title: string | null;
  titleEn: string | null;
  description: string | null;
  descriptionEn: string | null;
}

/** 按语言取券的标题（zh fallback 到 en，再 fallback 到券码） */
export function couponTitle(c: CouponView, lang: "zh" | "en"): string {
  const zh = c.title?.trim();
  const en = c.titleEn?.trim();
  return lang === "zh" ? (zh || en || c.code) : (en || zh || c.code);
}

/** 按语言取券的说明 */
export function couponDescription(c: CouponView, lang: "zh" | "en"): string {
  const zh = c.description?.trim();
  const en = c.descriptionEn?.trim();
  return lang === "zh" ? (zh || en || "") : (en || zh || "");
}

/**
 * 券的「主卖点」文案：百分比券 → "20% off"，固定额券 → "Save $10.00"，
 * 免邮券 → "Free shipping on your order"。金额由调用方用 format() 格式化，
 * 保证与结算币种一致（不在此层拼货币符号，杜绝硬编码）。
 */
export function couponHeadline(
  c: Pick<CouponView, "type" | "value">,
  t: TranslateFn,
  formatMoney: (n: number) => string,
): string {
  switch (c.type) {
    case "PERCENTAGE":
      return t("{pct}% off", { pct: String(c.value) });
    case "FIXED":
      return t("Save {amount}", { amount: formatMoney(c.value) });
    case "FREE_SHIPPING":
      return t("Free shipping on your order");
    default:
      return "";
  }
}

/** 券的门槛提示；minSpend=0 时返回 null（无门槛不展示） */
export function couponMinSpendLabel(
  c: Pick<CouponView, "minSpend">,
  t: TranslateFn,
  formatMoney: (n: number) => string,
): string | null {
  if (!c.minSpend || c.minSpend <= 0) return null;
  return t("Min. spend {amount}", { amount: formatMoney(c.minSpend) });
}
