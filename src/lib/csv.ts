import "server-only";

/** CSV 工具(管理端订单导出，Excel 兼容) */

function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // CSV 公式注入防护：Excel/WPS 会执行 = + - @ 开头的单元格
  const safe = s.length > 0 && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * 对象数组 → CSV 字符串。
 * 自动添加 UTF-8 BOM，保证 Excel 打开中文不乱码。
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "\uFEFF";
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
  ];
  return "\uFEFF" + lines.join("\r\n");
}

/** 为对象数组补全字段(保证列一致) */
export function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const keys = new Set<string>();
  for (const r of rows) Object.keys(r).forEach((k) => keys.add(k));
  const header = [...keys];
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const k of header) out[k] = r[k] ?? "";
    return out;
  });
}
