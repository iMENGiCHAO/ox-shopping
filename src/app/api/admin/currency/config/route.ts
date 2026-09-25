import { z } from "zod";
import { apiHandler, json, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/session";
import {
  upsertCurrency,
  deleteCurrency,
} from "@/server/services/currency-config.service";

export const runtime = "nodejs";

const upsertSchema = z.object({
  code: z.string().trim().length(3),
  name: z.string().trim().max(60),
  country: z.string().trim().max(60),
  symbol: z.string().trim().max(10),
  locale: z.string().trim().max(20),
  flagCode: z.string().trim().max(2),
  enabled: z.boolean().optional(),
  payable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

/** POST /api/admin/currency/config — 新增或更新币种（按 code upsert，仅 ADMIN） */
export const POST = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, upsertSchema);
  const row = await upsertCurrency(input);
  await audit({
    userId: actor.id,
    action: "CURRENCY_CONFIG_UPSERT",
    entity: "CurrencyConfig",
    entityId: row.code,
    meta: { ...input, code: row.code },
    req,
  });
  return json({ currency: row });
});

/** DELETE /api/admin/currency/config?code=USD — 删除币种（仅 ADMIN） */
export const DELETE = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  if (!/^[A-Za-z]{3}$/.test(code)) return json({ error: "无效的币种代码" }, { status: 400 });
  await deleteCurrency(code);
  await audit({
    userId: actor.id,
    action: "CURRENCY_CONFIG_DELETE",
    entity: "CurrencyConfig",
    entityId: code.toUpperCase(),
    req,
  });
  return json({ ok: true });
});
