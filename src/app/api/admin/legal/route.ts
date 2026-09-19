import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { invalidateSettingsCache } from "@/server/services/settings.service";
import { z } from "zod";

export const runtime = "nodejs";

/** 法务文档的存储键（site_settings）；与前台 policies 页共用同一组键 */
const LEGAL_KEYS = [
  "policyAccessibility",
  "policyPrivacy",
  "policyTerms",
  "policyRefund",
  "policyCookies",
  "policyDataSharingOptOut",
] as const;

type LegalKey = (typeof LEGAL_KEYS)[number];

/** 存储值：历史单语字符串 或 { zh, en } 双语对象；空串 = 回退内置默认 */
const documentSchema = z.union([
  z.string().max(20000),
  z.object({ zh: z.string().max(20000), en: z.string().max(20000) }),
]);

const schema = z.object({
  policyAccessibility: documentSchema.optional(),
  policyPrivacy: documentSchema.optional(),
  policyTerms: documentSchema.optional(),
  policyRefund: documentSchema.optional(),
  policyCookies: documentSchema.optional(),
  policyDataSharingOptOut: documentSchema.optional(),
});

/** 取某键当前存储值（无记录 → null，前端回退内置默认展示） */
async function readStored(key: LegalKey): Promise<unknown> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

/** GET /api/admin/legal — 法务文档编辑数据 */
export const GET = apiHandler(async () => {
  await requireStaff();
  const documents: Record<string, unknown> = {};
  for (const key of LEGAL_KEYS) documents[key] = await readStored(key);
  return json({ documents });
});

/** PUT /api/admin/legal — 保存法务文档（仅提交的键被更新） */
export const PUT = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, schema);

  const touched: string[] = [];
  for (const key of LEGAL_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    const jsonValue =
      typeof value === "string"
        ? value.trim()
          ? value
          : "" // 空串 = 恢复默认
        : value;
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value: jsonValue },
      create: { key, value: jsonValue },
    });
    touched.push(key);
  }

  if (touched.length) {
    // 政策页内容属站点设置缓存范围，写入后立即失效
    await invalidateSettingsCache();
    await audit({
      userId: actor.id,
      action: "SETTINGS_UPDATE",
      entity: "SiteSetting",
      meta: { keys: touched, scope: "legal-pages" },
      req,
    });
  }
  return json({ ok: true });
});
