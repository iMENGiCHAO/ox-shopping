import { requireAdmin } from "@/lib/auth/session";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { exportCommissionRows } from "@/server/services/distribution";
import { normalizeRows, toCsv } from "@/lib/csv";
import type { CommissionState } from "@/lib/distribution/contract";

export const runtime = "nodejs";

const STATES = new Set(["PENDING", "SETTLED", "REVERSED"]);

/**
 * GET /api/admin/distribution/commissions/export — 佣金流水导出 CSV（P1-8）
 * 走 `lib/csv` 的统一转义（含 Excel 公式注入防护 + UTF-8 BOM）。
 */
export async function GET(req: Request) {
  assertDistributionEnabled();
  await requireAdmin();

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const status = statusRaw && STATES.has(statusRaw) ? (statusRaw as CommissionState) : undefined;
  const orderNumber = url.searchParams.get("orderNumber")?.trim() || undefined;

  const { rows, total, truncated } = await exportCommissionRows({
    ...(status ? { status } : {}),
    ...(orderNumber ? { orderNumber } : {}),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(normalizeRows(rows)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // 截断可见（P1 修复）：超上限时文件名带 -partial，并回传总数 ——
      // 此前静默丢行，财务据缺行 CSV 对账会得出错误结论。
      "Content-Disposition": `attachment; filename="distribution-commissions-${stamp}${
        truncated ? "-partial" : ""
      }.csv"`,
      "X-Export-Total": String(total),
      "X-Export-Truncated": truncated ? "true" : "false",
      "Cache-Control": "no-store",
    },
  });
}
