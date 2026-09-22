import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getAccountSummary, getDistributionConfig } from "@/server/services/distribution";

export const runtime = "nodejs";

/** GET /api/distribution/my/account — 我的分销账户（余额/冻结/累计/在途） */
export const GET = apiHandler(async () => {
  assertDistributionEnabled();
  const user = await requireUser();
  const [account, config] = await Promise.all([
    getAccountSummary(user.id),
    getDistributionConfig(),
  ]);
  return json({ account, minWithdrawAmount: config.minWithdrawAmount });
});
