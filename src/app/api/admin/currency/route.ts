import { z } from "zod";
import { apiHandler, json, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import {
  getRateSnapshot,
  loadOverrides,
  saveOverrides,
  invalidateRateCache,
} from "@/components/shop/currency-server";
import { listAdminCurrencies } from "@/server/services/currency-config.service";

export const runtime = "nodejs";

/** GET /api/admin/currency — 汇率快照 + 币种配置（含 enabled/payable，仅 staff） */
export const GET = apiHandler(async () => {
  await requireStaff();
  const [snapshot, overrides, currencies] = await Promise.all([
    getRateSnapshot(),
    loadOverrides(),
    listAdminCurrencies(),
  ]);
  return json({
    snapshot,
    currencies,
    overrides,
  });
});

const overridesSchema = z.object({
  /** { CNY: 7.25, EUR: null } —— null 表示清除该币种覆写,恢复自动汇率 */
  overrides: z.record(z.string(), z.number().positive().nullable()),
});

/** PUT /api/admin/currency — 保存手动覆写(仅 ADMIN) */
export const PUT = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, overridesSchema);

  // 覆写只接受「已配置」的币种（后台增删后即时跟随，不再依赖前端硬编码清单）
  const configured = await listAdminCurrencies();
  const known = new Set(configured.map((c) => c.code));
  const clean: Record<string, number> = {};
  for (const [code, rate] of Object.entries(input.overrides)) {
    if (rate === null) continue;
    if (!known.has(code)) continue; // 未启用的币种直接忽略
    clean[code] = Math.round(rate * 1_000_000) / 1_000_000;
  }
  await saveOverrides(clean);
  invalidateRateCache();

  await audit({
    userId: actor.id,
    action: "CURRENCY_OVERRIDES_UPDATE",
    meta: { overrides: clean },
    req,
  });

  const snapshot = await getRateSnapshot();
  return json({ snapshot, overrides: clean });
});
