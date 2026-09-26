import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { getCurrencyDef } from "@/components/shop/currency";

/** shadcn/ui 标准工具：合并 Tailwind 类名 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 重要：本文件不携带 `import "server-only"`，会被 client bundle 拉入。
 * 因此禁止在此 re-export 任何 server-only 工具（如 getClientIp），
 * 业务代码应直接 `import { getClientIp } from "@/lib/server/utils-server"`。
 */

/** 金额格式化(Decimal/数字 → "¥1,299.00" / "$99.00") */
export function formatMoney(
  amount: number | string | null | undefined,
  currency = DEFAULT_CURRENCY,
): string {
  if (amount === null || amount === undefined) return "-";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(n)) return "-";
  // 走 CURRENCIES 表里的 locale 拿正确千分位/小数点
  // （避免 JPY/EUR 等被错误按 en-US 渲染）
  const def = getCurrencyDef(currency);
  try {
    return new Intl.NumberFormat(def.locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${def.symbol}${n.toFixed(2)}`;
  }
}

/** 元 → 分(Stripe 以最小货币单位计价，避免浮点误差) */
export function toCents(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

/** 分 → 元 */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** 随机 token(十六进制，默认 32 字节 = 64 字符)——Web Crypto，Edge/Node 通用 */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** sha256 十六进制摘要(Web Crypto，Edge/Node 通用；异步) */
export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 生成订单号：ORD + 日期 + 随机数字 */
export function generateOrderNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(100000 + Math.random() * 900000));
  return `ORD${ymd}${rand}`;
}

/** 分页参数解析(带边界保护) */
export function parsePagination(
  searchParams: URLSearchParams,
  defaults = { page: 1, pageSize: 12 },
  maxPageSize = 100,
): { page: number; pageSize: number; skip: number; take: number } {
  const rawPage = Number(searchParams.get("page") ?? defaults.page);
  const rawSize = Number(searchParams.get("pageSize") ?? defaults.pageSize);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : defaults.page;
  const pageSize =
    Number.isInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, maxPageSize) : defaults.pageSize;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/**
 * 客户端 IP 已迁移至 @/lib/server/utils-server（server-only）。
 * 旧调用方通过 re-export 兼容，业务代码应直接 import 自 server 模块。
 */

/** 安全文件名：UUID + 原扩展名(仅保留合法图片扩展名) */
export function randomFilename(originalName: string): string {
  const extMatch = originalName.toLowerCase().match(/\.(jpe?g|png|webp|gif|avif)$/);
  const ext = extMatch ? extMatch[1] : "jpg";
  return `${randomToken(16)}.${ext}`;
}

/** 日期字符串(yyyy-mm-dd，用于订单号前缀/发票) */
export function dateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * JSON-LD 安全序列化（2026-09-26 商用审计高危修复）。
 *
 * `JSON.stringify` 不转义 `<` —— 字符串里的 `</script>` 会闭合 JSON-LD 的
 * script 标签，其后内容按 HTML 解析。FAQ/产品名/站点名这类**由后台录入、
 * 前台公开页渲染**的字段一旦被注入 `</script><meta refresh>`，全体访客会被
 * 强制跳钓鱼站（meta refresh 不受 CSP nonce/strict-dynamic 限制）。
 *
 * 修法（Next.js 官方推荐）：把 `<` 转义为 `\u003c`，一行修根。所有
 * `dangerouslySetInnerHTML` 承载 JSON-LD 的地方必须经此函数。
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
