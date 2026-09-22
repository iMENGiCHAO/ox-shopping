import { formatMoney } from "@/lib/utils";
import type { Lang } from "@/lib/shop-i18n";

/**
 * 与 lang-provider 的 `t` 同形。单独声明是为了让本文件保持纯函数 ——
 * 不 import 客户端组件，服务端误引用也不会带上 "use client" 边界。
 */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** 佣金/提现/业绩一律 CNY：服务端已折算，展示统一 ¥ + 两位小数 */
export function cny(value: number | string | null | undefined): string {
  return formatMoney(value, "CNY");
}

/** 原币种订单金额：不折算、不拼符号，交给 formatMoney 按币种走 locale */
export function money(value: number | string | null | undefined, currency: string): string {
  return formatMoney(value, currency || "USD");
}

function safeDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 日期 + 时分（分销流水看时点，不看秒） */
export function formatDateTime(iso: string | null | undefined, lang: Lang): string {
  const d = safeDate(iso);
  if (!d) return "-";
  return d.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 只要年月日（业绩按日表） */
export function formatDate(iso: string | null | undefined): string {
  const d = safeDate(iso);
  if (!d) return "-";
  return d.toISOString().slice(0, 10);
}

/** 订单状态文案：与 /orders 用同一批词条，避免两处口径不一致 */
export function orderStatusLabel(t: Translate, status: string): string {
  switch (status) {
    case "PENDING_PAYMENT":
      return t("Payment pending");
    case "PAID":
      return t("Paid");
    case "PROCESSING":
      return t("Processing");
    case "SHIPPED":
      return t("Shipped");
    case "DELIVERED":
      return t("Delivered");
    case "CANCELLED":
      return t("Cancelled");
    case "REFUNDED":
      return t("Refunded");
    default:
      return status || "-";
  }
}

/** 佣金状态：PENDING 在分销语境是「待结算」，不要复用订单的「待处理」 */
export function commissionStatusLabel(t: Translate, status: string): string {
  switch (status) {
    case "PENDING":
      return t("Pending settlement");
    case "SETTLED":
      return t("Settled");
    case "REVERSED":
      return t("Reversed");
    default:
      return status || "-";
  }
}

/** 提现状态：PAID 是「已打款」，与订单的「已支付」区分 */
export function withdrawStatusLabel(t: Translate, status: string): string {
  switch (status) {
    case "PENDING":
      return t("Pending review");
    case "APPROVED":
      return t("Approved");
    case "PAID":
      return t("Paid out");
    case "REJECTED":
      return t("Rejected");
    default:
      return status || "-";
  }
}

/**
 * 绑定来源。服务端存的是写入时的标记（register / first_order 也兼容早期的 link/qrcode/code），
 * 认不出来的原样展示 —— 宁可露出原始值，也不要编一个看起来对的中文。
 */
export function bindSourceLabel(t: Translate, source: string | null): string {
  switch (source) {
    case "register":
      return t("Registered");
    case "first_order":
      return t("First order");
    case "link":
      return t("Link");
    case "qrcode":
      return t("QR code");
    case "code":
      return t("Invite code");
    default:
      return source || "-";
  }
}

/** 层级文案（1=直接客户，2+ 属下级团队） */
export function levelLabel(t: Translate, level: number): string {
  return t("Level {n}", { n: level });
}
