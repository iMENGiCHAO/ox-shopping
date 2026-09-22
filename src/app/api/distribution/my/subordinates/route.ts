import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getMySubordinates } from "@/server/services/distribution";

export const runtime = "nodejs";

/** GET /api/distribution/my/subordinates — 直接下级（明细）+ 间接下级（仅汇总） */
export const GET = apiHandler(async () => {
  assertDistributionEnabled();
  const user = await requireUser();
  const data = await getMySubordinates(user.id);
  return json(data);
});
