/**
 * 分销场景的敏感信息脱敏（纯函数）。
 *
 * 为什么放在服务端而不是「前端拿到明文再打码」：
 *   前端脱敏等于把明文发给了无权限方，抓包即可见 —— 那不是脱敏，是装饰。
 *   本模块在**服务端出参前**执行，分销商接口永远拿不到完整手机号/详细地址。
 */

/** 手机号：保留前 3 后 4 → 138****1234；无法识别时整体打码 */
export function maskPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\s|-/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

/** 邮箱：保留首字符与域名 → a***@example.com */
export function maskEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  const at = String(raw).indexOf("@");
  if (at <= 0) return "***";
  const name = String(raw).slice(0, at);
  const domain = String(raw).slice(at);
  return `${name.slice(0, 1)}***${domain}`;
}

/** 姓名：保留姓 → 张**；单字/英文名保留首字符 */
export function maskName(raw: string | null | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) return "";
  if (name.length === 1) return name;
  return `${name.slice(0, 1)}**`;
}

/**
 * 地址：只返回「省 市」；详细地址与收件人、电话一律不下发给分销商。
 * `snapshot` 为订单 `addressSnapshot`（{ recipientName, phone, province, city, district, detail }）。
 */
export function maskRegion(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return "";
  const s = snapshot as Record<string, unknown>;
  const parts = [s.province, s.city].filter(
    (v): v is string => typeof v === "string" && !!v.trim(),
  );
  return parts.join(" ");
}

/** 从地址快照里安全取手机号（只用于脱敏输出，不返回原文） */
export function phoneFromSnapshot(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return "";
  const phone = (snapshot as Record<string, unknown>).phone;
  return typeof phone === "string" ? phone : "";
}

/** 收款账户：最多保留尾 4 位 → ****1234 */
export function maskAccountInfo(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  if (s.length <= 4) return "****";
  return `****${s.slice(-4)}`;
}
