import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { distributionConfigSchema } from "@/lib/validations/distribution";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import {
  ensureDefaultCommissionRules,
  getDistributionConfig,
  saveDistributionConfig,
} from "@/server/services/distribution";

export const runtime = "nodejs";

/** GET /api/admin/distribution/config — 分销策略配置（缺失项回落默认口径） */
export const GET = apiHandler(async () => {
  assertDistributionEnabled();
  await requireAdmin();
  const [config, ruleCount] = await Promise.all([
    getDistributionConfig(),
    ensureDefaultCommissionRules().then(() => true),
  ]);
  return json({ config, defaultRulesEnsured: ruleCount });
});

/** PUT /api/admin/distribution/config — 修改分销策略（层级上限/绑定规则/持有期/提现门槛…） */
export const PUT = apiHandler(async (req) => {
  assertDistributionEnabled();
  const actor = await requireAdmin();
  const input = await readJson(req, distributionConfigSchema);
  const config = await saveDistributionConfig(input);
  await audit({
    userId: actor.id,
    action: "DISTRIBUTION_CONFIG_UPDATE",
    entity: "SiteSetting",
    entityId: "distribution",
    meta: { ...input },
    req,
  });
  return json({ config });
});
