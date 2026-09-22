import { apiHandler, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getPromotionLog } from "@/server/services/distribution";

export const runtime = "nodejs";

const PAGE_SIZE = 20;

/** GET /api/admin/distribution/promotions — 自动升级记录（谁因哪次推广成为分销商） */
export const GET = apiHandler(async (req) => {
  assertDistributionEnabled();
  await requireAdmin();
  const page = Math.max(1, Number(new URL(req.url).searchParams.get("page") ?? 1) || 1);
  const { rows, total } = await getPromotionLog({
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return json({
    data: rows,
    pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) },
  });
});
