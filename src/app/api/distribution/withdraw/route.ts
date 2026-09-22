import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { withdrawApplySchema } from "@/lib/validations/distribution";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { applyWithdraw } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * POST /api/distribution/withdraw — 申请提现（一期：平台审核 + 线下打款）。
 * 余额用条件更新原子扣减，同一用户同时只允许一笔在途申请。
 */
export const POST = apiHandler(async (req) => {
  assertDistributionEnabled();
  const user = await requireUser();
  const rl = await rateLimit({ key: `dist-withdraw:${user.id}`, ...RATE_LIMITS.distWithdraw });
  if (!rl.ok) throw rateLimited();

  const input = await readJson(req, withdrawApplySchema);
  const result = await applyWithdraw({
    userId: user.id,
    amount: input.amount,
    ...(input.accountInfo ? { accountInfo: input.accountInfo } : {}),
    ...(input.remark ? { remark: input.remark } : {}),
    ...(input.payeeName ? { payeeName: input.payeeName } : {}),
    ...(input.payeeMethod ? { payeeMethod: input.payeeMethod } : {}),
    req,
  });
  return json({ ok: true, ...result });
});
