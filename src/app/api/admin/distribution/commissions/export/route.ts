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

  const rows = await exportCommissionRows({
    ...(status ? { status } : {}),
    ...(orderNumber ? { orderNumber } : {}),
  });

  return new Response(toCsv(normalizeRows(rows)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="distribution-commissions-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
