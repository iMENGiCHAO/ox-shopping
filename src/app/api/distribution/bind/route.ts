import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { distributionBindSchema } from "@/lib/validations/distribution";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { bindCustomer } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * POST /api/distribution/bind — 以推广码绑定当前用户（自然流量客户的「补绑」入口）。
 *
 * 规则与服务端一致：已有有效绑定则**不覆盖**（除非平台开启 allowRebind），
 * 已下过单的客户不允许补绑 —— 抢绑在这里被挡住，而不是靠前端隐藏按钮。
 */
export const POST = apiHandler(async (req) => {
  assertDistributionEnabled();
  const user = await requireUser();
  const rl = await rateLimit({ key: `dist-bind:${user.id}`, ...RATE_LIMITS.distBind });
  if (!rl.ok) throw rateLimited();

  const input = await readJson(req, distributionBindSchema);
  const { normalizeReferralInput } = await import("@/lib/distribution/referral");
  const code = normalizeReferralInput(input.code);
  if (!code) return json({ ok: false, outcome: "INVALID_CODE" });

  const result = await bindCustomer({
    customerId: user.id,
    code,
    ...(input.bindType ? { bindType: input.bindType } : {}),
    ...(input.source ? { source: input.source } : {}),
    req,
  });
  return json({ ok: result.outcome === "BOUND" || result.outcome === "REBOUND", ...result });
});
