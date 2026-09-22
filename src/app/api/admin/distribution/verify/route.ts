import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { verifyAccountConsistency } from "@/server/services/distribution";

export const runtime = "nodejs";

const schema = z.object({ apply: z.boolean().default(false) });

/**
 * POST /api/admin/distribution/verify — 账户一致性对账（P0-6）
 *
 * 账户余额是**物化汇总**（列表页/提现校验读它），流水才是事实来源。
 * 本接口把两者对平：`apply=true` 时按流水推导值修复账户（幂等，可反复执行）。
 */
export const POST = apiHandler(async (req) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const input = await readJson(req, schema).catch(() => ({ apply: false }));

  const result = await verifyAccountConsistency({ apply: input.apply });
  await audit({
    userId: actor.id,
    action: input.apply ? "DISTRIBUTION_ACCOUNT_REPAIR" : "DISTRIBUTION_ACCOUNT_VERIFY",
    entity: "DistributorAccount",
    meta: {
      accounts: result.accounts,
      drifted: result.drifted.length,
      repaired: result.repaired,
    },
    req,
  });
  return json({ ok: true, ...result });
});
