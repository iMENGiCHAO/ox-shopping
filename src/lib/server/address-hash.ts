import "server-only";
import { createHash } from "node:crypto";

/**
 * 地址内容指纹（边界审计：双击保存=两条相同地址、脚本灌地址簿）：
 * sha256(规范化内容字段)。isDefault 刻意不参与——「同一地址内容的默认开关」
 * 不是新地址；既有行迁移后为 NULL（PG unique 对 NULL 不去重，兼容存量）。
 *
 * 独立 server-only 文件：utils.ts 被 shop 前端组件共用，node:crypto 不能进
 * client bundle。
 */
export function addressContentHash(a: {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  line2?: string | null;
  country?: string | null;
  postalCode?: string | null;
}): string {
  const parts = [
    a.recipientName.trim(),
    a.phone.trim(),
    a.province.trim(),
    a.city.trim(),
    a.district.trim(),
    a.detail.trim(),
    (a.line2 ?? "").trim(),
    (a.country ?? "").trim().toUpperCase(),
    (a.postalCode ?? "").trim(),
  ];
  return createHash("sha256").update(parts.join("\u0001")).digest("hex");
}
