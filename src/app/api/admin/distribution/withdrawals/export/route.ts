import { requireAdmin } from "@/lib/auth/session";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { exportWithdrawRows } from "@/server/services/distribution";
import { normalizeRows, toCsv } from "@/lib/csv";
import type { WithdrawStatus } from "@prisma/client";

export const runtime = "nodejs";

const STATES = new Set(["PENDING", "APPROVED", "PAID", "REJECTED"]);

/**
 * GET /api/admin/distribution/withdrawals/export — 提现记录导出 CSV（P1-8）
 * 线下打款需要拿这份表去财务/银行，因此包含收款人实名与收款方式。
 */
export async function GET(req: Request) {
  assertDistributionEnabled();
  await requireAdmin();

  const statusRaw = new URL(req.url).searchParams.get("status");
  const status =
    statusRaw && STATES.has(statusRaw) ? (statusRaw as WithdrawStatus) : undefined;

  const rows = await exportWithdrawRows(status ? { status } : {});
  return new Response(toCsv(normalizeRows(rows)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="distribution-withdrawals-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
